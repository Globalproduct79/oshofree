import type { OfferCardProps } from '@/components/campaign/OfferCard'

// No database here: the Phoenix preview dialog imports this in the browser.

// The card fields of a live offer: all the browser gets. Claim codes and link URLs stay on the server.
export type PreviewOffer = {
  id: string
  brand: string
  headline: string
  description: string
  category: string
  creative: { image: string | null; color: string | null }
  share: { reward_label: string }
  ends_at: string
}

export type Mine = OfferCardProps & { id?: string; category?: string }
export type PreviewCard = OfferCardProps & { key: string; category?: string }

const MINE_KEY = '__mine'

function toCard(o: PreviewOffer): PreviewCard {
  return {
    key: o.id,
    brand: o.brand,
    headline: o.headline,
    description: o.description,
    category: o.category,
    imageUrl: o.creative.image,
    color: o.creative.color,
    rewardLabel: o.share.reward_label,
    endsAt: new Date(o.ends_at),
  }
}

// My card, outlined, among the live offers: where it already sits when it is live, otherwise first.
export function mergeMine(offers: PreviewOffer[], mine: Mine): PreviewCard[] {
  const { id, ...card } = mine
  const own: PreviewCard = { ...card, key: id ?? MINE_KEY, outlined: true }
  const cards = offers.map(toCard)
  const at = id === undefined ? -1 : cards.findIndex((c) => c.key === id)
  return at === -1 ? [own, ...cards] : cards.map((c, i) => (i === at ? own : c))
}
