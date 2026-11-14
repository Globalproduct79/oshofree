import type {
  Campaign, CampaignRevision, CampaignStatus, Placement, Prisma, RedeemMethod, RejectReason,
} from '@prisma/client'
import { audit } from '@/lib/audit'
import { ageGated, campaignDates, rewardLabel, type CampaignInput } from '@/lib/campaign-schema'
import { isRejectReason, PACE, rejectReasonText } from '@/lib/copy-campaign'
import { NOTIFY } from '@/lib/copy-notifications'
import { db, type Tx } from '@/lib/db'
import { daysLeft } from '@/lib/format'
import { mintRootLink } from '@/lib/links'
import { isCountry, MARKETS, type Country } from '@/lib/markets'
import { campaignSpendCents, canSubmitBudget, COMMITTED, creditSummary } from '@/lib/money'
import { notifyGlobal, notifyWorkspace } from '@/lib/notifications'
import { currentCpmCents, currentFx } from '@/lib/rates'

export { ageGated, campaignDraftInput, campaignInput, rewardLabel, validateCampaign, type CampaignInput } from '@/lib/campaign-schema'
export { campaignSpendCents } from '@/lib/money'

// The campaign state machine (ADV "Object model → Status state machine", spec §6.3, §6.14.3):
//   draft | rejected | ended ──submit──▶ review ──approve──▶ scheduled (start ahead) | live
//   review ──reject (code + note)──▶ rejected
//   live ──pause──▶ paused ──resume (refused over the credit limit)──▶ live | scheduled
//   live | paused ──end now──▶ ended
// A flight whose end has passed is never submitted, approved or resumed ('FLIGHT_ENDED').
// Editing the offer of a running campaign (live, scheduled, paused) opens a CampaignRevision that
// goes to review while the current version keeps running; it is decided only while the campaign is
// still running, and any move out of running (end now) or into review deletes it. Any other status is
// edited in place (offer, and money and timing too) and goes to review. Errors are plain string
// codes, as in slice 1, except CREDIT_LIMIT, which always carries the limit and the excess.

export const RUNNING: CampaignStatus[] = ['live', 'scheduled', 'paused']
const SUBMITTABLE: CampaignStatus[] = ['draft', 'rejected', 'ended']
const EDITED_IN_PLACE: CampaignStatus[] = ['draft', 'review', 'rejected', 'ended']
const CHANGEABLE: CampaignStatus[] = ['draft', 'review', 'scheduled', 'live', 'paused']
const PHOENIX = 'phoenix'
const GLOBAL_REVIEW = '/admin/review'

export type CreditLimitError = Error & { message: 'CREDIT_LIMIT'; limitCents: number; excessCents: number }

const creditLimit = (limitCents: number, excessCents: number) =>
  Object.assign(new Error('CREDIT_LIMIT'), { limitCents, excessCents }) as CreditLimitError

export const isCreditLimit = (e: unknown): e is CreditLimitError => e instanceof Error && e.message === 'CREDIT_LIMIT'

const toCents = (usd: number) => usd * 100
const campaignHref = (id: string) => `/app/campaigns/${id}`
const auditTarget = (c: Campaign) => ({ type: 'Campaign', id: c.id, workspaceId: c.workspaceId })
const isCount = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0
const isDate = (d: unknown): d is Date => d instanceof Date && Number.isFinite(d.getTime())

// The offer: what a revision holds and Global reviews. Money and timing are not part of it.
export type OfferFields = {
  brand: string
  category: string
  headline: string
  description: string
  tileColor: string
  creativeImageKey?: string | null
  creativeVideoKey?: string | null
  placement: Placement
  redeemMethod: RedeemMethod
  claimCode?: string | null
  linkUrl?: string | null
  ageGated: boolean
}

// Money and timing, and (optionally) the campaign's own name and market, which only an in-place edit
// may change.
type Terms = { budgetUsd: number; startsAt: Date; endsAt: Date; rewardLocal: number; name?: string; country?: Country }

// The whole campaign as the Edit offer form holds it. A campaign edited in place (draft, review,
// rejected, ended) takes all of it, so an ended one gets new dates before it goes back to review; a
// running one's revision keeps the offer only (spec §6.14.3) and its money and timing change through
// changeWithoutReview.
export type CampaignEdit = OfferFields & Terms

type OfferData = Omit<Required<OfferFields>, 'tileColor'> & {
  tileColor: string | null
  creativeImageKey: string | null
  creativeVideoKey: string | null
  claimCode: string | null
  linkUrl: string | null
}

// Exactly the offer keys, absent ones as null so applying an offer also clears them. Whatever else
// the caller sends (a budget, a status) is dropped.
function offerData(i: OfferFields): OfferData {
  return {
    brand: i.brand,
    category: i.category,
    headline: i.headline,
    description: i.description,
    tileColor: i.tileColor ?? null,
    creativeImageKey: i.creativeImageKey ?? null,
    creativeVideoKey: i.creativeVideoKey ?? null,
    placement: i.placement,
    redeemMethod: i.redeemMethod,
    claimCode: i.claimCode ?? null,
    linkUrl: i.linkUrl?.trim() || null,
    ageGated: i.ageGated,
  }
}

// Any money or timing key makes the input a full edit, which must then be complete and valid.
const hasTerms = (i: OfferFields | CampaignEdit): i is CampaignEdit =>
  'budgetUsd' in i || 'startsAt' in i || 'endsAt' in i || 'rewardLocal' in i

function termsOf(i: CampaignEdit): Terms {
  const { budgetUsd, startsAt, endsAt, rewardLocal, name, country } = i
  if (!isCount(budgetUsd) || !isCount(rewardLocal) || !isDate(startsAt) || !isDate(endsAt)) throw 'INVALID'
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) throw 'INVALID'
  if (country !== undefined && !isCountry(country)) throw 'INVALID'
  if (endsAt <= startsAt) throw 'END_BEFORE_START'
  return { budgetUsd, startsAt, endsAt, rewardLocal, ...(name !== undefined && { name }), ...(country !== undefined && { country }) }
}

function fields(i: CampaignInput) {
  const { startsAt, endsAt } = campaignDates(i.startsAt, i.runsForDays, i.country, i.endsAt)
  return {
    name: i.name,
    brand: i.brand,
    country: i.country,
    category: i.category,
    headline: i.headline,
    description: i.description,
    tileColor: i.tileColor ?? null,
    creativeImageKey: i.creativeImageKey ?? null,
    creativeVideoKey: i.creativeVideoKey ?? null,
    placement: i.placement,
    redeemMethod: i.redeemMethod,
    claimCode: i.claimCode ?? null,
    linkUrl: i.linkUrl?.trim() || null,
    ageGated: ageGated(i),
    budgetUsd: i.budgetUsd,
    rewardLocal: i.rewardLocal,
    startsAt,
    endsAt,
    shareRewardLabel: rewardLabel(i.country, i.rewardLocal),
  }
}

// The guarded write every transition goes through: it applies only while the row is still in one of
// `from`, so a concurrent change makes it refuse instead of overwrite.
async function move(
  id: string,
  from: CampaignStatus[],
  data: Prisma.CampaignUncheckedUpdateManyInput,
  client: Tx = db,
): Promise<Campaign> {
  const { count } = await client.campaign.updateMany({ where: { id, status: { in: from } }, data })
  if (count === 0) throw 'INVALID_TRANSITION'
  return client.campaign.findUniqueOrThrow({ where: { id } })
}

async function load(id: string) {
  const row = await db.campaign.findUnique({ where: { id }, include: { workspace: { select: { name: true, status: true } } } })
  if (!row) throw 'NOT_FOUND'
  const { workspace, ...campaign } = row
  return { campaign, workspace }
}

// Revisions are written and decided under this lock, and only while the campaign is running.
async function lockRunning(tx: Tx, id: string): Promise<{ placement: Placement }> {
  const [row] = await tx.$queryRaw<{ status: CampaignStatus; placement: Placement }[]>`
    SELECT status, placement FROM "Campaign" WHERE id = ${id} FOR UPDATE`
  if (!row || !RUNNING.includes(row.status)) throw 'INVALID_TRANSITION'
  return row
}

// A pending revision belongs to a running campaign; leaving running (end now, review) deletes it.
const dropPendingRevision = (tx: Tx, campaignId: string) =>
  tx.campaignRevision.deleteMany({ where: { campaignId, status: 'review' } })

// Phoenix's CPM for the market and placement at `at`: 'NO_RATE' without the channel or a rate.
async function phoenixCpmCents(country: Country, placement: Placement, at: Date): Promise<number> {
  const channel = await db.channel.findUnique({ where: { key: PHOENIX }, select: { id: true } })
  if (!channel) throw 'NO_RATE'
  return currentCpmCents(channel.id, country, placement, at)
}

async function tellInReview(c: Campaign, workspaceName: string): Promise<void> {
  const mine = NOTIFY.inReview(c.name)
  await notifyWorkspace(c.workspaceId, 'review', mine.title, mine.detail, campaignHref(c.id))
  const global = NOTIFY.needsReview(c.name, workspaceName)
  await notifyGlobal('review', global.title, global.detail, GLOBAL_REVIEW)
}

// "{code}: {note}" on the decision record; the code alone when Global left no note.
const decisionReason = (code: RejectReason, note: string | null) => (note ? `${code}: ${note}` : code)

// ---- Drafts ----

export function createCampaign(workspaceId: string, i: CampaignInput): Promise<Campaign> {
  return db.campaign.create({ data: { workspaceId, status: 'draft', ...fields(i) } })
}

export function updateCampaign(id: string, i: CampaignInput): Promise<Campaign> {
  return move(id, ['draft', 'rejected'], fields(i))
}

// ---- Submit ----

// Submit and the in-place edit share one path: refuse a flight already over, snapshot Phoenix's CPM
// and the FX of the campaign's market (the edited one, when an edit moves it), check credit, then
// review. Credit in use counts a committed campaign's budget − spend, so review adds the new remainder
// less what the campaign already holds: nothing for an unchanged campaign in review, budget − spend
// for a draft, rejected or ended one.
async function sendToReview(
  c: Campaign, workspaceName: string, from: CampaignStatus[], now: Date, offer?: OfferData, terms?: Terms,
): Promise<Campaign> {
  if (!from.includes(c.status)) throw 'INVALID_TRANSITION'
  const next = { ...c, ...offer, ...terms }
  if (next.endsAt <= now) throw 'FLIGHT_ENDED'
  const cpmCents = await phoenixCpmCents(next.country, next.placement, now)
  const fxPerUsd = await currentFx(next.country, now)
  const spendCents = await campaignSpendCents(c.id)
  const budgetCents = toCents(next.budgetUsd)
  if (terms && budgetCents < spendCents) throw 'BUDGET_BELOW_SPEND'
  const heldCents = COMMITTED.includes(c.status) ? Math.max(0, toCents(c.budgetUsd) - spendCents) : 0
  const credit = await canSubmitBudget(c.workspaceId, budgetCents, Math.max(0, budgetCents - spendCents) - heldCents)
  if (!credit.ok) throw creditLimit(credit.limitCents, credit.excessCents)
  const sent = await db.$transaction(async (tx) => {
    const row = await move(c.id, from, {
      ...offer, ...terms, ...(terms && { shareRewardLabel: rewardLabel(next.country, terms.rewardLocal) }), cpmCents, fxPerUsd, status: 'review', submittedAt: now,
      decidedAt: null, endedAt: null, pausedBy: null, rejectReasonCode: null, rejectReason: null,
    }, tx)
    await dropPendingRevision(tx, c.id)
    return row
  })
  await tellInReview(sent, workspaceName)
  return sent
}

export async function submitCampaign(id: string, byUserId: string, now = new Date()): Promise<Campaign> {
  const { campaign, workspace } = await load(id)
  return sendToReview(campaign, workspace.name, SUBMITTABLE, now)
}

// ---- Global's decision on a campaign in review ----

// Approve puts the campaign live, or scheduled while its start is ahead, and mints its links. Status,
// links and the decision commit together. A revised offer is decided with approveRevision.
export async function approveCampaign(id: string, byUserId: string, now = new Date()): Promise<Campaign> {
  const { campaign: c, workspace } = await load(id)
  if (workspace.status !== 'approved') throw 'WORKSPACE_NOT_APPROVED'
  if (c.status !== 'review') throw 'INVALID_TRANSITION'
  if (c.endsAt <= now) throw 'FLIGHT_ENDED'
  const status = c.startsAt > now ? 'scheduled' : 'live'
  const approved = await db.$transaction(async (tx) => {
    const row = await move(id, ['review'], { status, decidedAt: now }, tx)
    const channels = await tx.channel.findMany({ where: { isLive: true }, select: { id: true } })
    for (const ch of channels) await mintRootLink(id, ch.id, tx)
    await tx.reviewAction.create({ data: { targetType: 'Campaign', targetId: id, action: 'Approve', byUserId, at: now } })
    return row
  })
  await audit(byUserId, 'campaign.approve', auditTarget(approved), { status: 'review' }, { status })
  const told = status === 'live' ? NOTIFY.live(c.name) : NOTIFY.scheduled(c.name, c.startsAt, MARKETS[c.country].timezone)
  await notifyWorkspace(c.workspaceId, 'approved', told.title, told.detail, campaignHref(id))
  return approved
}

// A "no" needs a reason code; the note may be empty. A revised offer is decided with rejectRevision.
export async function rejectCampaign(
  id: string, byUserId: string, code: RejectReason, note = '', now = new Date(),
): Promise<Campaign> {
  if (!isRejectReason(code)) throw 'REASON_REQUIRED'
  const { campaign: c } = await load(id)
  const why = note.trim() || null
  const rejected = await db.$transaction(async (tx) => {
    const row = await move(id, ['review'], { status: 'rejected', rejectReasonCode: code, rejectReason: why, decidedAt: now }, tx)
    await tx.reviewAction.create({
      data: { targetType: 'Campaign', targetId: id, action: 'Reject', reason: decisionReason(code, why), byUserId, at: now },
    })
    return row
  })
  await audit(byUserId, 'campaign.reject', auditTarget(rejected), { status: 'review' },
    { status: 'rejected', rejectReasonCode: code, rejectReason: why })
  const told = NOTIFY.rejected(c.name, rejectReasonText(code, why))
  await notifyWorkspace(c.workspaceId, 'approved', told.title, told.detail, campaignHref(id))
  return rejected
}

// ---- Running ----

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- every transition names its actor; a pause records only that the advertiser paused
export function pauseCampaign(id: string, byUserId: string): Promise<Campaign> {
  return move(id, ['live'], { status: 'paused', pausedBy: 'user' })
}

// Refused once the flight is over, or while credit in use is over the limit. Back to live, or to
// scheduled while the start is ahead.
export async function resumeCampaign(id: string, byUserId: string, now = new Date()): Promise<Campaign> {
  const { campaign: c } = await load(id)
  if (c.status !== 'paused') throw 'INVALID_TRANSITION'
  if (c.endsAt <= now) throw 'FLIGHT_ENDED'
  const credit = await creditSummary(c.workspaceId)
  if (credit.overLimit) throw creditLimit(credit.limitCents, credit.inUseCents - credit.limitCents)
  return move(id, ['paused'], { status: c.startsAt > now ? 'scheduled' : 'live', pausedBy: null })
}

// "End campaign now": the unspent budget stops counting as credit in use (money.ts COMMITTED), and a
// revised offer still waiting goes with it.
export async function endCampaign(
  id: string, byUserId: string, now = new Date(),
): Promise<{ campaign: Campaign; releasedCents: number }> {
  const campaign = await db.$transaction(async (tx) => {
    const row = await move(id, ['live', 'paused'], { status: 'ended', endedAt: now, pausedBy: null }, tx)
    await dropPendingRevision(tx, id)
    return row
  })
  const releasedCents = Math.max(0, toCents(campaign.budgetUsd) - (await campaignSpendCents(id)))
  return { campaign, releasedCents }
}

// ---- The daily job's moves (spec §6.5, §6.7) ----

// Per-campaign failures of a batch move: with a handler the batch reports them and carries on; without
// one the first failure throws. A campaign another change already moved is skipped, not a failure.
export type OnCampaignError = (campaignId: string, e: unknown) => void

async function eachCampaign(
  ids: string[], onError: OnCampaignError | undefined, step: (id: string) => Promise<Campaign | null>,
): Promise<Campaign[]> {
  const done: Campaign[] = []
  for (const id of ids) {
    try {
      const c = await step(id)
      if (c) done.push(c)
    } catch (e) {
      if (e === 'INVALID_TRANSITION') continue
      if (!onError) throw e
      onError(id, e)
    }
  }
  return done
}

// A scheduled flight goes live once its start — stored as the market's midnight — has come, and its
// workspace hears that it is live.
export async function startScheduled(now = new Date(), onError?: OnCampaignError): Promise<Campaign[]> {
  const due = await db.campaign.findMany({
    where: { status: 'scheduled', startsAt: { lte: now } },
    select: { id: true },
    orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
  })
  return eachCampaign(due.map((c) => c.id), onError, async (id) => {
    const c = await move(id, ['scheduled'], { status: 'live' })
    const told = NOTIFY.live(c.name)
    await notifyWorkspace(c.workspaceId, 'approved', told.title, told.detail, campaignHref(c.id))
    return c
  })
}

// Auto-pause: while a workspace's credit in use is over its limit, its live campaigns pause (pausedBy
// 'credit'; Resume stays refused until it is back under) and its members hear why.
export async function pauseOverCredit(workspaceId: string, onError?: OnCampaignError): Promise<Campaign[]> {
  if (!(await creditSummary(workspaceId)).overLimit) return []
  const live = await db.campaign.findMany({ where: { workspaceId, status: 'live' }, select: { id: true }, orderBy: { id: 'asc' } })
  return eachCampaign(live.map((c) => c.id), onError, async (id) => {
    const c = await move(id, ['live'], { status: 'paused', pausedBy: 'credit' })
    const told = NOTIFY.pausedOverCredit(c.name)
    await notifyWorkspace(c.workspaceId, 'credit', told.title, told.detail, campaignHref(c.id))
    return c
  })
}

export type ChangeWithoutReview = { budgetUsd?: number; endsAt?: Date; rewardLocal?: number }

// Money and timing (ADV §2 "Change without review"), applied at once whatever the status, except
// ended and rejected. The budget cannot drop below spend; an increase must fit under the credit limit
// (a draft's budget is not in use yet); the end must be after the start and not already past.
export async function changeWithoutReview(
  id: string, byUserId: string, change: ChangeWithoutReview, now = new Date(),
): Promise<Campaign> {
  const { budgetUsd, endsAt, rewardLocal } = change
  if (budgetUsd !== undefined && !isCount(budgetUsd)) throw 'INVALID'
  if (rewardLocal !== undefined && !isCount(rewardLocal)) throw 'INVALID'
  if (endsAt !== undefined && !isDate(endsAt)) throw 'INVALID'
  const { campaign: c } = await load(id)
  if (!CHANGEABLE.includes(c.status)) throw 'INVALID_TRANSITION'
  if (endsAt && (endsAt <= c.startsAt || endsAt <= now)) throw 'END_BEFORE_START'
  if (budgetUsd !== undefined) {
    const budgetCents = toCents(budgetUsd)
    if (budgetCents < (await campaignSpendCents(id))) throw 'BUDGET_BELOW_SPEND'
    const increaseCents = budgetCents - toCents(c.budgetUsd)
    if (increaseCents > 0 && COMMITTED.includes(c.status)) {
      const credit = await canSubmitBudget(c.workspaceId, budgetCents, increaseCents)
      if (!credit.ok) throw creditLimit(credit.limitCents, credit.excessCents)
    }
  }
  const label = rewardLocal === undefined ? undefined : rewardLabel(c.country, rewardLocal)
  return move(id, CHANGEABLE, { budgetUsd, endsAt, rewardLocal, shareRewardLabel: label })
}

// ---- The offer and its revisions ----

// A running campaign keeps its live version: the offer fields become the one pending revision (a
// second edit replaces it), priced now if the placement changes. Any other status is overwritten in
// place — offer, and money and timing when the input carries them — and goes to review as a
// submission.
export async function editOffer(
  id: string, byUserId: string, input: OfferFields | CampaignEdit, now = new Date(),
): Promise<{ campaign: Campaign; revision: CampaignRevision | null }> {
  const { campaign: c, workspace } = await load(id)
  const offer = offerData(input)
  if (EDITED_IN_PLACE.includes(c.status)) {
    const terms = hasTerms(input) ? termsOf(input) : undefined
    return { campaign: await sendToReview(c, workspace.name, EDITED_IN_PLACE, now, offer, terms), revision: null }
  }
  const revision = await db.$transaction(async (tx) => {
    const { placement } = await lockRunning(tx, id)
    const cpmCents = offer.placement === placement ? null : await phoenixCpmCents(c.country, offer.placement, now)
    const pending = await tx.campaignRevision.findFirst({ where: { campaignId: id, status: 'review' }, select: { id: true } })
    return pending
      ? tx.campaignRevision.update({ where: { id: pending.id }, data: { data: offer, cpmCents, submittedAt: now } })
      : tx.campaignRevision.create({ data: { campaignId: id, data: offer, cpmCents, submittedAt: now } })
  })
  await tellInReview(c, workspace.name)
  return { campaign: c, revision }
}

// The revision waiting for Global, for the campaign page's status line and the review queue.
export function pendingRevision(campaignId: string): Promise<CampaignRevision | null> {
  return db.campaignRevision.findFirst({ where: { campaignId, status: 'review' }, orderBy: { submittedAt: 'desc' } })
}

async function revisionCampaign(revisionId: string) {
  const revision = await db.campaignRevision.findUnique({ where: { id: revisionId }, select: { campaignId: true } })
  if (!revision) throw 'NOT_FOUND'
  return load(revision.campaignId)
}

// Swaps the revised offer in (with its new placement's price, if any) and bumps the version; the
// status is untouched. Under the campaign lock the revision is read as it is now, so an edit that
// replaced its data is the one applied.
export async function approveRevision(revisionId: string, byUserId: string, now = new Date()): Promise<Campaign> {
  const { campaign: c, workspace } = await revisionCampaign(revisionId)
  if (workspace.status !== 'approved') throw 'WORKSPACE_NOT_APPROVED'
  const applied = await db.$transaction(async (tx) => {
    await lockRunning(tx, c.id)
    const revision = await tx.campaignRevision.findUnique({ where: { id: revisionId } })
    if (!revision || revision.status !== 'review') throw 'INVALID_TRANSITION'
    await tx.campaignRevision.update({ where: { id: revisionId }, data: { status: 'applied', decidedAt: now } })
    const offer = offerData(revision.data as OfferFields)
    const row = await tx.campaign.update({
      where: { id: c.id }, data: { ...offer, cpmCents: revision.cpmCents ?? undefined, version: { increment: 1 } },
    })
    await tx.reviewAction.create({ data: { targetType: 'Campaign', targetId: c.id, action: 'Approve', byUserId, at: now } })
    return row
  })
  await audit(byUserId, 'campaign.revision.approve', auditTarget(applied), { version: applied.version - 1 },
    { version: applied.version, revisionId })
  const told = NOTIFY.revisionApproved(c.name)
  await notifyWorkspace(c.workspaceId, 'approved', told.title, told.detail, campaignHref(c.id))
  return applied
}

// The campaign stays exactly as it was; the decision is stored on the revision (spec §6.14.3).
export async function rejectRevision(
  revisionId: string, byUserId: string, code: RejectReason, note = '', now = new Date(),
): Promise<CampaignRevision> {
  if (!isRejectReason(code)) throw 'REASON_REQUIRED'
  const { campaign: c } = await revisionCampaign(revisionId)
  const why = note.trim() || null
  const rejected = await db.$transaction(async (tx) => {
    await lockRunning(tx, c.id)
    const { count } = await tx.campaignRevision.updateMany({
      where: { id: revisionId, status: 'review' },
      data: { status: 'rejected', rejectReasonCode: code, rejectReason: why, decidedAt: now },
    })
    if (count === 0) throw 'INVALID_TRANSITION'
    await tx.reviewAction.create({
      data: { targetType: 'Campaign', targetId: c.id, action: 'Reject', reason: decisionReason(code, why), byUserId, at: now },
    })
    return tx.campaignRevision.findUniqueOrThrow({ where: { id: revisionId } })
  })
  await audit(byUserId, 'campaign.revision.reject', auditTarget(c), undefined,
    { revisionId, rejectReasonCode: code, rejectReason: why })
  const told = NOTIFY.revisionRejected(c.name, rejectReasonText(code, why))
  await notifyWorkspace(c.workspaceId, 'approved', told.title, told.detail, campaignHref(c.id))
  return rejected
}

// ---- Facts for the hero and the campaign page ----

export type CampaignFacts = {
  status: CampaignStatus
  daysLeft: number
  spendCents: number
  leftCents: number
  // Spend ÷ budget × 100, as the spend bars take it (unclamped).
  spendPct: number
  pace: number
  paceNote: string
}

// On pace between these; the hero's note and the daily job's pace warning share them.
export const PACE_BAND = { slow: 0.8, fast: 1.2 }

// The hero's note (ADV §1): bands < 0.8 slow and > 1.2 fast apply to live campaigns only.
export function paceNote(status: CampaignStatus, pace: number): string {
  if (status === 'paused') return PACE.paused
  if (status === 'review') return PACE.review
  if (status !== 'live') return ''
  if (pace < PACE_BAND.slow) return PACE.slow
  if (pace > PACE_BAND.fast) return PACE.fast
  return PACE.onPace
}

// Pace = (spend ÷ budget) ÷ max(0.05, elapsed ÷ flight), elapsed = now − start, flight = end − start.
export async function campaignFacts(id: string, now = new Date()): Promise<CampaignFacts> {
  const c = await db.campaign.findUnique({ where: { id }, select: { status: true, budgetUsd: true, startsAt: true, endsAt: true } })
  if (!c) throw 'NOT_FOUND'
  const spendCents = await campaignSpendCents(id)
  const budgetCents = toCents(c.budgetUsd)
  const spent = budgetCents > 0 ? spendCents / budgetCents : 0
  const flight = c.endsAt.getTime() - c.startsAt.getTime()
  const elapsed = flight > 0 ? (now.getTime() - c.startsAt.getTime()) / flight : 1
  const pace = spent / Math.max(0.05, elapsed)
  return {
    status: c.status,
    daysLeft: daysLeft(c.endsAt, now),
    spendCents,
    leftCents: Math.max(0, budgetCents - spendCents),
    spendPct: spent * 100,
    pace,
    paceNote: paceNote(c.status, pace),
  }
}
