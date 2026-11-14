import { ensureFraudRules } from '@/lib/fraud'
import type { Country } from '@/lib/markets'
import { PLACEMENTS, setFx, setRate, setShare } from '@/lib/rates'
import { CPM_CENTS, FX_PER_USD, PHOENIX_SHARE } from '@/lib/reference-rates'

// Phoenix's reference rate card, FX and share (lib/reference-rates), set through the Rates page's own setters,
// effective well before any campaign.
export async function seedRates(phoenixId: string, adminId: string, effectiveFrom: Date): Promise<void> {
  for (const [country, cpms] of Object.entries(CPM_CENTS) as [Country, readonly number[]][]) {
    for (const [i, placement] of PLACEMENTS.entries()) await setRate(phoenixId, country, placement, cpms[i], adminId, effectiveFrom)
  }
  for (const [country, fx] of Object.entries(FX_PER_USD) as [Country, number][]) await setFx(country, fx, adminId, effectiveFrom)
  await setShare(phoenixId, PHOENIX_SHARE, adminId, effectiveFrom)
  // GLB §2.5: the three fraud checks, on.
  await ensureFraudRules()
}
