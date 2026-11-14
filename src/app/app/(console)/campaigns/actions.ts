'use server'

import type { Campaign, Workspace } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { audit } from '@/lib/audit'
import {
  ageGated, campaignDates, checkCampaign, isRealDay, localMidnight, REVISION_TERMS, ruleContext, type CampaignInput,
  type FormEdit,
} from '@/lib/campaign-schema'
import {
  changeWithoutReview, createCampaign, editOffer, endCampaign, isCreditLimit, pauseCampaign, resumeCampaign, RUNNING,
  submitCampaign, type CampaignEdit, type ChangeWithoutReview, type OfferFields,
} from '@/lib/campaigns'
import { CAMPAIGN } from '@/lib/copy-campaign'
import { CAMPAIGN_FORM_COPY as F } from '@/lib/copy-campaign-form'
import { MONEY } from '@/lib/copy-money'
import { CAMPAIGN_COPY } from '@/lib/copy-report'
import { db } from '@/lib/db'
import { isCountry, MARKETS, type Country } from '@/lib/markets'
import { campaignSpendCents, COMMITTED, creditSummary } from '@/lib/money'
import { previewOffersFor } from '@/lib/offers'
import { requireMember, type Member } from '@/lib/permissions'
import type { PreviewOffer } from '@/lib/preview-merge'

type Failure = { error: string }
type Done = { ok: true; toast: string }

const campaignPath = (id: string) => `/app/campaigns/${id}`
const target = (c: Pick<Campaign, 'id' | 'workspaceId'>) => ({ type: 'Campaign', id: c.id, workspaceId: c.workspaceId })

// Global acting inside a workspace leaves a trail; members' own changes are their workspace's business.
async function auditGlobal(
  m: Member, action: string, c: Pick<Campaign, 'id' | 'workspaceId'>, after?: Record<string, string | number | boolean>,
) {
  if (m.role === 'Global') await audit(m.user.id, action, target(c), undefined, after)
}

// A campaign of the session's workspace; the client never names a workspace.
const ownCampaign = (m: Member, id: unknown) =>
  typeof id === 'string' ? db.campaign.findFirst({ where: { id, workspaceId: m.workspace.id } }) : null

// The lifecycle's refusals as the form says them; anything else is a bug and stays a server error.
function refusal(e: unknown, country: Country): string {
  if (e === 'NO_RATE') return F.errors.noRate(MARKETS[country].name)
  if (e === 'NO_FX') return F.errors.noFx(MARKETS[country].name)
  if (isCreditLimit(e)) return MONEY.overCredit(e.limitCents, e.excessCents)
  if (e === 'FLIGHT_ENDED') return F.errors.flightEnded
  if (e === 'INVALID_TRANSITION') return F.errors.invalidTransition
  if (e === 'BUDGET_BELOW_SPEND') return CAMPAIGN.budgetBelowSpend
  if (e === 'END_BEFORE_START') return F.validation.flight
  if (e === 'INVALID') return F.invalid.other
  throw e
}

const record = (v: unknown): Record<string, unknown> => (v !== null && typeof v === 'object' ? { ...v } : {})

// A Brand workspace's campaigns carry its brand: the form shows the field read-only (ADV §3).
function withBrand(raw: Record<string, unknown>, ws: Workspace, brand: string) {
  return ws.type === 'Brand' ? { ...raw, brand } : raw
}

// ---- Submit (New campaign) ----

// The form's rules again with the workspace's real credit, then create and submit in one go. A refusal
// from the lifecycle (no rate, credit moved meanwhile) leaves no draft behind.
export async function submitAction(input: unknown): Promise<{ id: string } | Failure> {
  const m = await requireMember('campaigns')
  const { user, workspace: ws } = m
  if (ws.status === 'declined') return { error: F.errors.workspaceDeclined }
  const raw = withBrand(record(input), ws, ws.name)
  const country = isCountry(raw.country) ? raw.country : ws.country
  const checked = checkCampaign(raw, ruleContext(ws.type, await creditSummary(ws.id), country))
  if (!checked.ok) return { error: checked.message }
  const created = await createCampaign(ws.id, checked.input)
  try {
    await submitCampaign(created.id, user.id)
  } catch (e) {
    await db.campaign.deleteMany({ where: { id: created.id, status: 'draft' } })
    return { error: refusal(e, checked.input.country) }
  }
  await auditGlobal(m, 'campaign.submit', created, { status: 'review' })
  revalidatePath('/app')
  return { id: created.id }
}

// ---- Edit offer ----

const OFFER_KEYS = [
  'brand', 'category', 'headline', 'description', 'tileColor', 'creativeImageKey', 'creativeVideoKey', 'placement',
  'redeemMethod', 'linkUrl', 'termsAccepted',
] as const
// What a revision cannot carry: money and timing change without review on the campaign page, and the
// name and market stay as they are while the campaign runs.
const NOT_IN_A_REVISION = ['budgetUsd', 'rewardLocal', 'startsAt', 'runsForDays', 'endsAt', 'name', 'country'] as const

function offerOf(i: CampaignInput, c: Campaign): OfferFields {
  return {
    brand: i.brand, category: i.category, headline: i.headline, description: i.description, tileColor: i.tileColor,
    creativeImageKey: i.creativeImageKey ?? null, creativeVideoKey: i.creativeVideoKey ?? null, placement: i.placement,
    redeemMethod: i.redeemMethod, linkUrl: i.linkUrl ?? null,
    // The form has no claim code (codes are issued per claim); the slice-1 one stays as it was.
    claimCode: c.claimCode, ageGated: ageGated(i),
  }
}

// A live, scheduled or paused campaign keeps running and the offer goes to review as a revision; any
// other status is overwritten in place, money and timing included, and goes to review (spec §6.14.3).
export async function editOfferAction(id: unknown, input: unknown): Promise<{ revision: boolean } | Failure> {
  const m = await requireMember('campaigns')
  const { user, workspace: ws } = m
  const c = await ownCampaign(m, id)
  if (!c) return { error: F.errors.notFound }
  if (ws.status === 'declined') return { error: F.errors.workspaceDeclined }
  const running = RUNNING.includes(c.status)
  const sent = record(input)
  // The form never sends these for a running campaign; dropping them silently would lose a change.
  if (running && NOT_IN_A_REVISION.some((k) => Object.hasOwn(sent, k))) throw 'INVALID'
  // A revision is judged on its offer alone, with the campaign's own name and market.
  const offerSent = Object.fromEntries(OFFER_KEYS.map((k) => [k, sent[k]]))
  const raw = withBrand(running ? { name: c.name, country: c.country, ...REVISION_TERMS, ...offerSent } : sent, ws, c.brand)
  const spendCents = running ? 0 : await campaignSpendCents(c.id)
  const edit: FormEdit = { running, heldCents: COMMITTED.includes(c.status) ? c.budgetUsd * 100 : spendCents }
  const checked = checkCampaign(raw, ruleContext(ws.type, await creditSummary(ws.id), c.country, edit))
  if (!checked.ok) return { error: checked.message }
  const i = checked.input
  const offer = offerOf(i, c)
  const change: OfferFields | CampaignEdit = running
    ? offer
    : {
        ...offer, ...campaignDates(i.startsAt, i.runsForDays, i.country, i.endsAt),
        budgetUsd: i.budgetUsd, rewardLocal: i.rewardLocal, name: i.name, country: i.country,
      }
  let revision: boolean
  try {
    revision = (await editOffer(c.id, user.id, change)).revision !== null
  } catch (e) {
    return { error: refusal(e, i.country) }
  }
  await auditGlobal(m, 'campaign.edit', c, { revision })
  revalidatePath('/app')
  revalidatePath(campaignPath(c.id))
  return { revision }
}

// ---- Pause and resume ----

// Every change is scoped to the session's workspace; the client never names one.
async function change(
  action: string,
  id: unknown,
  apply: (id: string, byUserId: string) => Promise<unknown>,
  overCredit?: string,
): Promise<{ ok: true } | Failure> {
  const m = await requireMember('campaigns')
  const row = await ownCampaign(m, id)
  if (!row) return { error: F.errors.notFound }
  try {
    await apply(row.id, m.user.id)
  } catch (e) {
    if (e === 'INVALID_TRANSITION' || e === 'FLIGHT_ENDED') return { error: F.errors.invalidTransition }
    if (isCreditLimit(e)) return { error: overCredit ?? MONEY.overCredit(e.limitCents, e.excessCents) }
    throw e
  }
  await auditGlobal(m, action, row)
  revalidatePath('/app')
  revalidatePath(campaignPath(row.id))
  return { ok: true }
}

export async function pause(id: string) {
  return change('campaign.pause', id, (cid, by) => pauseCampaign(cid, by))
}

export async function resume(id: string) {
  return change('campaign.resume', id, (cid, by) => resumeCampaign(cid, by), MONEY.cantResume)
}

// The live offers for the Phoenix preview. They are public on Phoenix already, so this reads across
// workspaces, and any member may look.
export async function previewOffers(country: unknown): Promise<PreviewOffer[]> {
  await requireMember('view')
  return isCountry(country) ? previewOffersFor(country, new Date()) : []
}

// ---- Change without review and End campaign now (ADV §2) ----

const C = CAMPAIGN_COPY.change

// The form sends strings; a blank field is not a number.
const numberOf = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : Number.NaN)

function changeRefusal(e: unknown): string {
  if (e === 'BUDGET_BELOW_SPEND') return CAMPAIGN.budgetBelowSpend
  if (isCreditLimit(e)) return CAMPAIGN.overCredit(e.limitCents)
  if (e === 'END_BEFORE_START') return C.endBeforeStart
  if (e === 'INVALID') return C.invalid
  if (e === 'INVALID_TRANSITION') return F.errors.invalidTransition
  if (e === 'NOT_FOUND') return F.errors.notFound
  throw e
}

// Budget (whole USD), end date (the market-local 'YYYY-MM-DD' the campaign stops at, as the form
// shows it) and share reward (whole local units), applied at once without review. Only the fields
// that differ from the campaign are sent, so an untouched one is never judged again (a budget that
// spend has since reached, an end date that has since passed).
export async function changeWithoutReviewAction(id: unknown, input: unknown): Promise<Done | Failure> {
  const m = await requireMember('campaigns')
  const c = await ownCampaign(m, id)
  if (!c) return { error: F.errors.notFound }
  const sent = record(input)
  if (typeof sent.endsAt !== 'string' || !isRealDay(sent.endsAt)) return { error: C.invalid }
  const budgetUsd = numberOf(sent.budgetUsd)
  const rewardLocal = numberOf(sent.rewardLocal)
  const endsAt = localMidnight(sent.endsAt, c.country)
  const change: ChangeWithoutReview = {
    ...(budgetUsd !== c.budgetUsd && { budgetUsd }),
    ...(endsAt.getTime() !== c.endsAt.getTime() && { endsAt }),
    ...(rewardLocal !== c.rewardLocal && { rewardLocal }),
  }
  try {
    await changeWithoutReview(c.id, m.user.id, change, new Date())
  } catch (e) {
    return { error: changeRefusal(e) }
  }
  await auditGlobal(m, 'campaign.change', c, {
    ...(change.budgetUsd !== undefined && { budgetUsd: change.budgetUsd }),
    ...(change.endsAt !== undefined && { endsAt: change.endsAt.toISOString() }),
    ...(change.rewardLocal !== undefined && { rewardLocal: change.rewardLocal }),
  })
  revalidatePath('/app')
  revalidatePath(campaignPath(c.id))
  return { ok: true, toast: CAMPAIGN.saved }
}

// A live or paused campaign ends now; what it had not spent stops counting as credit in use.
export async function endCampaignAction(id: unknown): Promise<Done | Failure> {
  const m = await requireMember('campaigns')
  const c = await ownCampaign(m, id)
  if (!c) return { error: F.errors.notFound }
  let releasedCents: number
  try {
    ;({ releasedCents } = await endCampaign(c.id, m.user.id, new Date()))
  } catch (e) {
    if (e === 'INVALID_TRANSITION') return { error: F.errors.invalidTransition }
    throw e
  }
  await auditGlobal(m, 'campaign.end', c, { status: 'ended', releasedCents })
  revalidatePath('/app')
  revalidatePath(campaignPath(c.id))
  return { ok: true, toast: CAMPAIGN.ended(releasedCents) }
}
