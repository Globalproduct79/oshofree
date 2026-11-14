import { ensureFraudRules } from '@/lib/fraud'
import type { Country } from '@/lib/markets'
import { PLACEMENTS, setFx, setRate, setShare } from '@/lib/rates'

// GLB §2.7: Phoenix's CPM per market in USD cents for card, featured, video and splash; each market's FX; the
// channel's share. Set through the Rates page's own setters, effective well before any campaign.
export const CPM_CENTS: Record<Country, readonly [number, number, number, number]> = {
  NG: [120, 220, 450, 800],
  KE: [150, 280, 550, 900],
  GH: [130, 240, 480, 800],
  TZ: [120, 220, 420, 750],
  SN: [140, 260, 500, 850],
}
export const FX_PER_USD: Record<Country, number> = { NG: 1550, KE: 129, GH: 15.5, TZ: 2600, SN: 610 }
export const PHOENIX_SHARE = 0.55

export async function seedRates(phoenixId: string, adminId: string, effectiveFrom: Date): Promise<void> {
  for (const [country, cpms] of Object.entries(CPM_CENTS) as [Country, readonly number[]][]) {
    for (const [i, placement] of PLACEMENTS.entries()) await setRate(phoenixId, country, placement, cpms[i], adminId, effectiveFrom)
  }
  for (const [country, fx] of Object.entries(FX_PER_USD) as [Country, number][]) await setFx(country, fx, adminId, effectiveFrom)
  await setShare(phoenixId, PHOENIX_SHARE, adminId, effectiveFrom)
  // GLB §2.5: the three fraud checks, on.
  await ensureFraudRules()
}
