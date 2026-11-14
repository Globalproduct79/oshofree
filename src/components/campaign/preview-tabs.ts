import type { PreviewPlacement } from '@/lib/preview-merge'

// The preview's formats (Prompt 7): the four placements, then the landing page and the share sheet. Only the
// campaign's own placement applies among the four; its page and its share sheet always do.
export type PreviewTab = PreviewPlacement | 'landing' | 'share'
export const PREVIEW_TABS: readonly PreviewTab[] = ['card', 'featured', 'video', 'splash', 'landing', 'share']

export const tabApplies = (tab: PreviewTab, placement: PreviewPlacement) =>
  tab === placement || tab === 'landing' || tab === 'share'

// The tab the preview opens on: the one asked for when it applies, else the campaign's placement.
export const startTab = (placement: PreviewPlacement, asked?: PreviewTab): PreviewTab =>
  asked && tabApplies(asked, placement) ? asked : placement

// The tab list's keys (WAI-ARIA tabs): the arrows step through the tabs that apply, wrapping; Home and End go to the
// first and the last. Any other key moves nothing.
export function moveTab(current: PreviewTab, key: string, placement: PreviewPlacement): PreviewTab | null {
  const on = PREVIEW_TABS.filter((t) => tabApplies(t, placement))
  const at = on.indexOf(current)
  if (key === 'ArrowRight') return on[(at + 1) % on.length]
  if (key === 'ArrowLeft') return on[(at - 1 + on.length) % on.length]
  if (key === 'Home') return on[0]
  if (key === 'End') return on[on.length - 1]
  return null
}
