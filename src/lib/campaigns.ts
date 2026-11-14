import type {
  Campaign, CampaignRevision, CampaignStatus, Placement, Prisma, RedeemMethod, RejectReason,
} from '@prisma/client'
import { audit } from '@/lib/audit'
import { campaignDates, type CampaignInput } from '@/lib/campaign-schema'
import { isRejectReason, PACE, rejectReasonText } from '@/lib/copy-campaign'
import { NOTIFY } from '@/lib/copy-notifications'
import { db, type Tx } from '@/lib/db'
import { daysLeft } from '@/lib/format'
import { mintRootLink } from '@/lib/links'
import { MARKETS, type Country } from '@/lib/markets'
import { campaignSpendCents, canSubmitBudget, COMMITTED, creditSummary } from '@/lib/money'
import { notifyGlobal, notifyWorkspace } from '@/lib/notifications'
import { currentCpmCents, currentFx } from '@/lib/rates'

export { campaignInput, validateCampaign, type CampaignInput } from '@/lib/campaign-schema'
export { campaignSpendCents } from '@/lib/money'

// The campaign state machine (ADV "Object model → Status state machine", spec §6.3, §6.14.3):
//   draft | rejected | ended ──submit──▶ review ──approve──▶ scheduled (start ahead) | live
//   review ──reject (code + note)──▶ rejected
//   live ──pause──▶ paused ──resume (refused over the credit limit)──▶ live | scheduled
//   live | paused ──end now──▶ ended
// Editing the offer of a running campaign (live, scheduled, paused) opens a CampaignRevision that
// goes to review while the current version keeps running; any other status is edited in place and
// goes to review. Errors are plain string codes, as in slice 1, except CREDIT_LIMIT, which always
// carries the limit and the excess (see isCreditLimit).

const RUNNING: CampaignStatus[] = ['live', 'scheduled', 'paused']
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

function fields(i: CampaignInput) {
  const { startsAt, endsAt } = campaignDates(i.startsAt, i.runsForDays)
  return {
    name: i.name,
    brand: i.brand,
    country: i.country,
    category: i.category,
    headline: i.headline,
    description: i.description,
    tileColor: i.tileColor ?? null,
    creativeImageKey: i.creativeImageKey ?? null,
    placement: i.placement,
    redeemMethod: i.redeemMethod,
    claimCode: i.claimCode ?? null,
    linkUrl: i.linkUrl?.trim() || null,
    budgetUsd: i.budgetUsd,
    startsAt,
    endsAt,
    shareRewardLabel: i.shareRewardLabel,
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

// Submit and the in-place offer edit share one path: snapshot Phoenix's CPM and the market FX, check
// the budget against credit, then review. A budget that already counts (editing while in review)
// adds nothing; a rejected or ended campaign's whole budget counts again.
async function sendToReview(
  c: Campaign, workspaceName: string, from: CampaignStatus[], now: Date, offer?: OfferData,
): Promise<Campaign> {
  if (!from.includes(c.status)) throw 'INVALID_TRANSITION'
  const placement = offer?.placement ?? c.placement
  const cpmCents = await phoenixCpmCents(c.country, placement, now)
  const fxPerUsd = await currentFx(c.country, now)
  const budgetCents = toCents(c.budgetUsd)
  const credit = await canSubmitBudget(c.workspaceId, budgetCents, COMMITTED.includes(c.status) ? 0 : budgetCents)
  if (!credit.ok) throw creditLimit(credit.limitCents, credit.excessCents)
  const sent = await db.$transaction(async (tx) => {
    const row = await move(c.id, from, {
      ...offer, cpmCents, fxPerUsd, status: 'review', submittedAt: now,
      decidedAt: null, endedAt: null, pausedBy: null, rejectReasonCode: null, rejectReason: null,
    }, tx)
    // The edit carries the whole offer, so a revision left waiting when the campaign ended is superseded.
    if (offer) await tx.campaignRevision.deleteMany({ where: { campaignId: c.id, status: 'review' } })
    return row
  })
  await tellInReview(sent, workspaceName)
  return sent
}

export async function submitCampaign(id: string, byUserId: string, now = new Date()): Promise<Campaign> {
  const { campaign, workspace } = await load(id)
  return sendToReview(campaign, workspace.name, SUBMITTABLE, now)
}

// ---- Global's decision ----

// Approve puts the campaign live, or scheduled while its start is ahead, and mints its links. Status,
// links and the decision commit together. A running campaign with a revised offer waiting has that
// revision approved instead.
export async function approveCampaign(id: string, byUserId: string, now = new Date()): Promise<Campaign> {
  const { campaign: c, workspace } = await load(id)
  if (workspace.status !== 'approved') throw 'WORKSPACE_NOT_APPROVED'
  if (c.status !== 'review') {
    const revision = await pendingRevision(id)
    if (revision) return approveRevision(revision.id, byUserId, now)
    throw 'INVALID_TRANSITION'
  }
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

// A "no" needs a reason code; the note may be empty. A running campaign with a revised offer waiting
// has that revision rejected instead, and stays as it is.
export async function rejectCampaign(
  id: string, byUserId: string, code: RejectReason, note = '', now = new Date(),
): Promise<Campaign> {
  if (!isRejectReason(code)) throw 'REASON_REQUIRED'
  const { campaign: c } = await load(id)
  if (c.status !== 'review') {
    const revision = await pendingRevision(id)
    if (!revision) throw 'INVALID_TRANSITION'
    await rejectRevision(revision.id, byUserId, code, note, now)
    return c
  }
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

// Refused while credit in use is over the limit. Back to live, or to scheduled while the start is ahead.
export async function resumeCampaign(id: string, byUserId: string, now = new Date()): Promise<Campaign> {
  const { campaign: c } = await load(id)
  if (c.status !== 'paused') throw 'INVALID_TRANSITION'
  const credit = await creditSummary(c.workspaceId)
  if (credit.overLimit) throw creditLimit(credit.limitCents, credit.inUseCents - credit.limitCents)
  return move(id, ['paused'], { status: c.startsAt > now ? 'scheduled' : 'live', pausedBy: null })
}

// "End campaign now": the unspent budget stops counting as credit in use (money.ts COMMITTED).
export async function endCampaign(
  id: string, byUserId: string, now = new Date(),
): Promise<{ campaign: Campaign; releasedCents: number }> {
  const campaign = await move(id, ['live', 'paused'], { status: 'ended', endedAt: now, pausedBy: null })
  const releasedCents = Math.max(0, toCents(campaign.budgetUsd) - (await campaignSpendCents(id)))
  return { campaign, releasedCents }
}

export type ChangeWithoutReview = { budgetUsd?: number; endsAt?: Date; rewardLocal?: number }

const isCount = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0

// Money and timing (ADV §2 "Change without review"), applied at once whatever the status, except
// ended and rejected. The budget cannot drop below spend; an increase must fit under the credit limit
// (a draft's budget is not in use yet); the end must be after the start and not already past.
export async function changeWithoutReview(
  id: string, byUserId: string, change: ChangeWithoutReview, now = new Date(),
): Promise<Campaign> {
  const { budgetUsd, endsAt, rewardLocal } = change
  if (budgetUsd !== undefined && !isCount(budgetUsd)) throw 'INVALID'
  if (rewardLocal !== undefined && !isCount(rewardLocal)) throw 'INVALID'
  if (endsAt !== undefined && !(endsAt instanceof Date && Number.isFinite(endsAt.getTime()))) throw 'INVALID'
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
  return move(id, CHANGEABLE, { budgetUsd, endsAt, rewardLocal })
}

// ---- The offer and its revisions ----

// A running campaign keeps its live version: the edit becomes the one pending revision (a second edit
// replaces its data). Any other status is overwritten in place and goes to review as a submission.
export async function editOffer(
  id: string, byUserId: string, input: OfferFields, now = new Date(),
): Promise<{ campaign: Campaign; revision: CampaignRevision | null }> {
  const { campaign: c, workspace } = await load(id)
  const offer = offerData(input)
  if (EDITED_IN_PLACE.includes(c.status)) {
    return { campaign: await sendToReview(c, workspace.name, EDITED_IN_PLACE, now, offer), revision: null }
  }
  // A new placement needs a Phoenix rate; it is charged from approval (approveRevision).
  if (offer.placement !== c.placement) await phoenixCpmCents(c.country, offer.placement, now)
  const revision = await db.$transaction(async (tx) => {
    // The row lock serialises edits to one campaign, so two cannot both open a revision.
    const [row] = await tx.$queryRaw<{ status: CampaignStatus }[]>`SELECT status FROM "Campaign" WHERE id = ${id} FOR UPDATE`
    if (!row || !RUNNING.includes(row.status)) throw 'INVALID_TRANSITION'
    const pending = await tx.campaignRevision.findFirst({ where: { campaignId: id, status: 'review' }, select: { id: true } })
    return pending
      ? tx.campaignRevision.update({ where: { id: pending.id }, data: { data: offer, submittedAt: now } })
      : tx.campaignRevision.create({ data: { campaignId: id, data: offer, submittedAt: now } })
  })
  await tellInReview(c, workspace.name)
  return { campaign: c, revision }
}

// The revision waiting for Global, for the campaign page's status line and the review queue.
export function pendingRevision(campaignId: string): Promise<CampaignRevision | null> {
  return db.campaignRevision.findFirst({ where: { campaignId, status: 'review' }, orderBy: { submittedAt: 'desc' } })
}

// Swaps the revised offer in and bumps the version; the status is untouched. A new placement is
// charged at Phoenix's rate when the revision was submitted, as a submission snapshots it.
export async function approveRevision(revisionId: string, byUserId: string, now = new Date()): Promise<Campaign> {
  const revision = await db.campaignRevision.findUnique({ where: { id: revisionId } })
  if (!revision) throw 'NOT_FOUND'
  if (revision.status !== 'review') throw 'INVALID_TRANSITION'
  const { campaign: c, workspace } = await load(revision.campaignId)
  if (workspace.status !== 'approved') throw 'WORKSPACE_NOT_APPROVED'
  const offer = offerData(revision.data as OfferFields)
  const cpmCents = offer.placement === c.placement ? undefined : await phoenixCpmCents(c.country, offer.placement, revision.submittedAt)
  const applied = await db.$transaction(async (tx) => {
    const { count } = await tx.campaignRevision.updateMany({
      where: { id: revisionId, status: 'review' }, data: { status: 'applied', decidedAt: now },
    })
    if (count === 0) throw 'INVALID_TRANSITION'
    const row = await tx.campaign.update({ where: { id: c.id }, data: { ...offer, cpmCents, version: { increment: 1 } } })
    await tx.reviewAction.create({ data: { targetType: 'Campaign', targetId: c.id, action: 'Approve', byUserId, at: now } })
    return row
  })
  await audit(byUserId, 'campaign.revision.approve', auditTarget(applied), { version: c.version },
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
  const revision = await db.campaignRevision.findUnique({ where: { id: revisionId } })
  if (!revision) throw 'NOT_FOUND'
  const { campaign: c } = await load(revision.campaignId)
  const why = note.trim() || null
  const rejected = await db.$transaction(async (tx) => {
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

// The hero's note (ADV §1): bands < 0.8 slow and > 1.2 fast apply to live campaigns only.
export function paceNote(status: CampaignStatus, pace: number): string {
  if (status === 'paused') return PACE.paused
  if (status === 'review') return PACE.review
  if (status !== 'live') return ''
  if (pace < 0.8) return PACE.slow
  if (pace > 1.2) return PACE.fast
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
