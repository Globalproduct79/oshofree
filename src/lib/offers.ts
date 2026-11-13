import type { Campaign, Country, ShareVia } from '@prisma/client'
import { deliveringWhere } from '@/lib/campaign-status'
import { db } from '@/lib/db'
import { linkUrl, mintChannelLink, mintRootLink } from '@/lib/links'
import type { PreviewOffer } from '@/lib/preview-merge'
import { imageUrl } from '@/lib/storage'

export type OfferDto = {
  id: string
  placement: 'card'
  brand: string
  headline: string
  description: string
  category: string
  creative: { image: string | null; color: string | null }
  cta: { label: string; type: 'code' | 'link'; url: string | null }
  share: { enabled: true; reward_label: string }
  ends_at: string
}

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

// Link offers click through the Root link, which logs the Claim; no share URL is ever handed out here.
function cta(c: Campaign, rootCode: string | undefined): OfferDto['cta'] {
  if (c.redeemMethod === 'code') return { label: c.claimCode ?? '', type: 'code', url: null }
  if (!rootCode) throw new Error(`No Root link for campaign ${c.id}`)
  return { label: 'Open offer', type: 'link', url: `${linkUrl(rootCode)}?go=claim` }
}

function toDto(c: Campaign, rootCode: string | undefined): OfferDto {
  return {
    id: c.id,
    placement: 'card',
    brand: c.brand,
    headline: c.headline,
    description: c.description,
    category: c.category,
    creative: {
      image: c.creativeImageKey ? `${process.env.APP_URL}${imageUrl(c.creativeImageKey)}` : null,
      color: c.tileColor ?? null,
    },
    cta: cta(c, rootCode),
    share: { enabled: true, reward_label: c.shareRewardLabel },
    ends_at: c.endsAt.toISOString(),
  }
}

// v1 serves card offers only, so the DTO's placement is always 'card'.
export async function offersFor(country: Country, channelId: string, now: Date): Promise<OfferDto[]> {
  const campaigns = await db.campaign.findMany({
    where: { ...deliveringWhere(now), country, placement: 'card' },
    orderBy: [{ placement: 'asc' }, { startsAt: 'asc' }, { id: 'asc' }],
  })
  const linkIds = campaigns.filter((c) => c.redeemMethod === 'link').map((c) => c.id)
  const roots = await rootCodes(linkIds, channelId)
  return campaigns.map((c) => toDto(c, roots.get(c.id)))
}

// What Phoenix would pull in this country now; nothing when the Phoenix channel is not set up or not live.
export async function phoenixOffers(country: Country, now: Date): Promise<OfferDto[]> {
  const phoenix = await db.channel.findFirst({ where: { key: 'phoenix', isLive: true }, select: { id: true } })
  return phoenix ? offersFor(country, phoenix.id, now) : []
}

// What the preview dialog draws, and nothing more: no claim code, no Root link URL.
export async function previewOffersFor(country: Country, now: Date): Promise<PreviewOffer[]> {
  const offers = await phoenixOffers(country, now)
  return offers.map((o) => ({
    id: o.id,
    brand: o.brand,
    headline: o.headline,
    description: o.description,
    category: o.category,
    creative: o.creative,
    share: { reward_label: o.share.reward_label },
    ends_at: o.ends_at,
  }))
}

export type ShareResult = { code: string; url: string } | 'unknown_offer' | 'not_delivering'

// A sharer's own link for an offer that is delivering now.
export async function shareOffer(
  offerId: string,
  channelId: string,
  sessionId: string,
  via: ShareVia,
  now: Date,
): Promise<ShareResult> {
  if (!(await db.campaign.findUnique({ where: { id: offerId }, select: { id: true } }))) return 'unknown_offer'
  const delivering = await db.campaign.findFirst({ where: { id: offerId, ...deliveringWhere(now) }, select: { id: true } })
  if (!delivering) return 'not_delivering'
  const link = await mintChannelLink(offerId, channelId, sessionId, via)
  return { code: link.code, url: linkUrl(link.code) }
}
