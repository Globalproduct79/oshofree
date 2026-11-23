import type { Campaign, Country, Placement, ShareVia } from '@prisma/client'
import { appUrl } from '@/lib/app-url'
import { deliveringWhere } from '@/lib/campaign-status'
import { normalisePhone, upsertConsumer } from '@/lib/consumers'
import { API_COPY } from '@/lib/copy-api'
import { db } from '@/lib/db'
import { isoInZone } from '@/lib/format'
import { linkUrl, mintChannelLink, mintRootLink } from '@/lib/links'
import { MARKETS } from '@/lib/markets'
import { spendByCampaign } from '@/lib/money'
import type { PreviewOffer } from '@/lib/preview-merge'
import { imageUrl } from '@/lib/image-rules'

// The prototype's offer on the wire (GLB §2.6 box 1).
export type OfferDto = {
  id: string
  placement: Placement
  brand: string
  headline: string
  description: string
  category: string
  creative: { image: string | null; video: string | null; color: string | null }
  cta: { label: string; type: 'code' | 'link'; url: string | null }
  flags: { sponsored: true; age_18: boolean }
  share: { enabled: true; reward_label: string }
  ends_at: string
}

// The prototype's placement order (GLB §2.7).
const PLACEMENT_ORDER: readonly Placement[] = ['card', 'featured', 'video', 'splash']

// This channel's Root link code per campaign: one read, then a mint only where one is missing.
async function rootCodes(campaignIds: string[], channelId: string): Promise<Map<string, string>> {
  const codes = new Map<string, string>()
  if (campaignIds.length === 0) return codes
  const roots = await db.shareLink.findMany({
    where: { campaignId: { in: campaignIds }, channelId, sharerType: 'Root' },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { campaignId: true, code: true },
  })
  for (const r of roots) if (!codes.has(r.campaignId)) codes.set(r.campaignId, r.code)
  for (const id of campaignIds) if (!codes.has(id)) codes.set(id, (await mintRootLink(id, channelId)).code)
  return codes
}

// Budget left per campaign in USD cents: budget − (delivery + reward charges), one grouped read.
async function remainingCents(campaigns: Campaign[]): Promise<Map<string, number>> {
  const spent = await spendByCampaign(campaigns.map((c) => c.id))
  return new Map(campaigns.map((c) => [c.id, c.budgetUsd * 100 - (spent.get(c.id) ?? 0)]))
}

// Phoenix renders from another host, so a creative's URL is absolute, on this server.
const absolute = (key: string | null) => (key ? appUrl(imageUrl(key)) : null)

// Code offers carry no code: Phoenix asks POST /claims for the session's own at claim time. Link offers
// click through the Root link, which logs the Claim; no share URL is ever handed out here.
function cta(c: Campaign, rootCode: string | undefined): OfferDto['cta'] {
  if (c.redeemMethod === 'code') return { label: API_COPY.ctaLabel, type: 'code', url: null }
  if (!rootCode) throw new Error(`No Root link for campaign ${c.id}`)
  return { label: API_COPY.ctaLabel, type: 'link', url: `${linkUrl(rootCode)}?go=claim` }
}

function toDto(c: Campaign, rootCode: string | undefined): OfferDto {
  return {
    id: c.id,
    placement: c.placement,
    brand: c.brand,
    headline: c.headline,
    description: c.description,
    category: c.category,
    creative: { image: absolute(c.creativeImageKey), video: absolute(c.creativeVideoKey), color: c.tileColor ?? null },
    cta: cta(c, rootCode),
    flags: { sponsored: true, age_18: c.ageGated },
    share: { enabled: true, reward_label: c.shareRewardLabel },
    // The exclusive end instant, on the market's clock.
    ends_at: isoInZone(c.endsAt, MARKETS[c.country].timezone),
  }
}

// Delivering campaigns in the country with budget left, ordered by placement then remaining budget (most left first).
// A reward is charged the moment a friend claims, so a campaign can spend its last cent mid-day; it leaves the feed
// at once rather than at the daily job's 02:00 run, which ends it.
export async function offersFor(country: Country, channelId: string, now: Date): Promise<OfferDto[]> {
  const delivering = await db.campaign.findMany({ where: { ...deliveringWhere(now), country } })
  const left = await remainingCents(delivering)
  const campaigns = delivering.filter((c) => left.get(c.id)! > 0)
  campaigns.sort(
    (a, b) =>
      PLACEMENT_ORDER.indexOf(a.placement) - PLACEMENT_ORDER.indexOf(b.placement) ||
      left.get(b.id)! - left.get(a.id)! ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
  const linkIds = campaigns.filter((c) => c.redeemMethod === 'link').map((c) => c.id)
  const roots = await rootCodes(linkIds, channelId)
  return campaigns.map((c) => toDto(c, roots.get(c.id)))
}

// What Phoenix would pull in this country now; nothing when the Phoenix channel is not set up or not live.
export async function phoenixOffers(country: Country, now: Date): Promise<OfferDto[]> {
  const phoenix = await db.channel.findFirst({ where: { key: 'phoenix', isLive: true }, select: { id: true } })
  return phoenix ? offersFor(country, phoenix.id, now) : []
}

// What the preview draws, and nothing more: no claim code, no Root link URL. Every placement, since the
// wall shows featured, video and splash offers too; nothing when the Phoenix channel is not set up or not live.
export async function previewOffersFor(country: Country, now: Date): Promise<PreviewOffer[]> {
  const phoenix = await db.channel.findFirst({ where: { key: 'phoenix', isLive: true }, select: { id: true } })
  if (!phoenix) return []
  const campaigns = await db.campaign.findMany({
    where: { ...deliveringWhere(now), country },
    orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
  })
  return campaigns.map((c) => ({
    id: c.id,
    brand: c.brand,
    headline: c.headline,
    category: c.category,
    placement: c.placement,
    ageGated: c.ageGated,
    creative: {
      image: c.creativeImageKey ? imageUrl(c.creativeImageKey) : null,
      video: c.creativeVideoKey ? imageUrl(c.creativeVideoKey) : null,
      color: c.tileColor ?? null,
    },
  }))
}

export type ShareResult = { code: string; url: string } | 'unknown_offer' | 'not_delivering' | 'bad_msisdn'

// A sharer's own link for an offer that is delivering now. With the sharer's number (verified by
// Phoenix's OTP), the link carries their Consumer, so a Phoenix sharer and a landing-page sharer are
// the same kind of record (spec §6.14.1); the number must be the offer's country's.
export async function shareOffer(
  offerId: string,
  channelId: string,
  sessionId: string,
  via: ShareVia,
  now: Date,
  msisdn?: string,
): Promise<ShareResult> {
  const offer = await db.campaign.findUnique({ where: { id: offerId }, select: { country: true } })
  if (!offer) return 'unknown_offer'
  const delivering = await db.campaign.findFirst({ where: { id: offerId, ...deliveringWhere(now) }, select: { id: true } })
  if (!delivering) return 'not_delivering'
  let consumerId: string | undefined
  if (msisdn !== undefined) {
    const phone = normalisePhone(msisdn, offer.country)
    if (!phone) return 'bad_msisdn'
    consumerId = (await upsertConsumer(phone, offer.country)).id
  }
  const link = await mintChannelLink(offerId, channelId, sessionId, via, consumerId)
  return { code: link.code, url: linkUrl(link.code) }
}
