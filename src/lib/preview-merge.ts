// No database here: the Phoenix preview imports this in the browser.

export type PreviewPlacement = 'card' | 'featured' | 'video' | 'splash'

// What the preview draws of an offer: the card fields only. Claim codes and link URLs stay on the server.
export type PreviewOffer = {
  id: string
  brand: string
  headline: string
  category: string
  placement: PreviewPlacement
  ageGated: boolean
  creative: { image: string | null; video: string | null; color: string | null }
}

const SLOT = new Set<PreviewPlacement>(['featured', 'video', 'splash'])
const LEADS = new Set<PreviewPlacement>(['featured', 'video'])
const MORE = 5

// The wall around the previewed campaign: its featured slot, and the grid (it first, then up to five others).
// GLB §5.1. The previewed campaign is counted once even when it is live itself.
export function previewWall(previewed: PreviewOffer, liveInMarket: PreviewOffer[]): { featured?: PreviewOffer; tiles: PreviewOffer[] } {
  const others = liveInMarket.filter((o) => o.id !== previewed.id)
  const featured = SLOT.has(previewed.placement) ? previewed : others.find((o) => LEADS.has(o.placement))
  const rest = others.filter((o) => o !== featured).slice(0, MORE)
  return { featured, tiles: featured === previewed ? rest : [previewed, ...rest] }
}
