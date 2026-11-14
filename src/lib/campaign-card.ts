import 'server-only'
import type { Campaign } from '@prisma/client'
import type { OfferCardProps } from '@/components/campaign/OfferCard'
import type { PreviewOffer } from '@/lib/preview-merge'
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
