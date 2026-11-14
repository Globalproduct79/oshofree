'use server'

import type { Campaign, Workspace } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { audit } from '@/lib/audit'
import {
  ageGated, campaignDates, checkCampaign, REVISION_TERMS, ruleContext, type CampaignInput, type FormEdit,
} from '@/lib/campaign-schema'
import {
  createCampaign, editOffer, isCreditLimit, pauseCampaign, resumeCampaign, RUNNING, submitCampaign,
  type CampaignEdit, type OfferFields,
} from '@/lib/campaigns'
import { CAMPAIGN } from '@/lib/copy-campaign'
import { CAMPAIGN_FORM_COPY as F } from '@/lib/copy-campaign-form'
import { MONEY } from '@/lib/copy-money'
import { db } from '@/lib/db'
import { isCountry, MARKETS, type Country } from '@/lib/markets'
import { campaignSpendCents, COMMITTED, creditSummary } from '@/lib/money'
import { previewOffersFor } from '@/lib/offers'
import { requireMember, type Member } from '@/lib/permissions'
import type { PreviewOffer } from '@/lib/preview-merge'

type Failure = { error: string }

const campaignPath = (id: string) => `/app/campaigns/${id}`
const target = (c: Pick<Campaign, 'id' | 'workspaceId'>) => ({ type: 'Campaign', id: c.id, workspaceId: c.workspaceId })

// Global acting inside a workspace leaves a trail; members' own changes are their workspace's business.
async function auditGlobal(m: Member, action: string, c: Pick<Campaign, 'id' | 'workspaceId'>, after?: Record<string, string | boolean>) {
  if (m.role === 'Global') await audit(m.user.id, action, target(c), undefined, after)
}

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
  const c = typeof id === 'string' ? await db.campaign.findFirst({ where: { id, workspaceId: ws.id } }) : null
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
  const row = typeof id === 'string' ? await db.campaign.findFirst({ where: { id, workspaceId: m.workspace.id } }) : null
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
