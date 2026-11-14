import type { Country } from '@/lib/markets'

// Phoenix's reference rate card (GLB §2.7): the CPM per market in USD cents for card, featured, video and splash
// (rates.PLACEMENTS order), each market's FX per USD, and the channel's share. The seed sets them, and
// `npm run bootstrap` sets them wherever production has none yet; after that Global changes them on Rates.
export const CPM_CENTS: Record<Country, readonly [number, number, number, number]> = {
  NG: [120, 220, 450, 800],
  KE: [150, 280, 550, 900],
  GH: [130, 240, 480, 800],
  TZ: [120, 220, 420, 750],
  SN: [140, 260, 500, 850],
}
export const FX_PER_USD: Record<Country, number> = { NG: 1550, KE: 129, GH: 15.5, TZ: 2600, SN: 610 }
export const PHOENIX_SHARE = 0.55
