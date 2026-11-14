import 'server-only'
import type { Campaign } from '@prisma/client'
import type { OfferCardProps } from '@/components/campaign/OfferCard'
import { PREVIEW_CODE } from '@/lib/landing/preview'
import { linkUrl } from '@/lib/links'
import type { PreviewCampaign, PreviewOffer } from '@/lib/preview-merge'
import { imageUrl } from '@/lib/storage'

// A stored campaign as its Offers-wall card, with its id so the Phoenix preview can find it among the live offers.
export function campaignCard(c: Campaign): OfferCardProps & { id: string; category: string } {
  return {
    id: c.id,
    brand: c.brand,
    headline: c.headline,
    description: c.description,
    category: c.category,
    imageUrl: c.creativeImageKey ? imageUrl(c.creativeImageKey) : null,
    color: c.tileColor,
    rewardLabel: c.shareRewardLabel,
    endsAt: c.endsAt,
  }
}

// A stored campaign as the Phoenix preview draws it.
export function previewOffer(c: Campaign): PreviewOffer {
  return {
    id: c.id,
    brand: c.brand,
    headline: c.headline,
    category: c.category,
    placement: c.placement,
    ageGated: c.ageGated,
    creative: {
      image: c.creativeImageKey ? imageUrl(c.creativeImageKey) : null,
      video: c.creativeVideoKey ? imageUrl(c.creativeVideoKey) : null,
      color: c.tileColor,
    },
  }
}

// The sample link the preview's share sheet holds: a sharer's link in shape, opening only the preview's refusal.
export const sampleShareLink = () => linkUrl(PREVIEW_CODE)

// A stored campaign as every tab of the preview draws it (Prompt 7): the card, its page and its share sheet.
export function offerPreview(c: Campaign): PreviewCampaign {
  return {
    ...previewOffer(c),
    description: c.description,
    rewardLabel: c.shareRewardLabel,
    redeemMethod: c.redeemMethod,
    endsAt: c.endsAt.toISOString(),
    country: c.country,
    sampleLink: sampleShareLink(),
  }
}
