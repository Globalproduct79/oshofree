import 'server-only'
import type { Campaign } from '@prisma/client'
import type { Mine } from '@/lib/preview-merge'
import { imageUrl } from '@/lib/storage'

// A stored campaign as its Offers-wall card, with its id so the Phoenix preview can find it among the live offers.
export function campaignCard(c: Campaign): Mine & { id: string } {
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
