// The Cost box's arithmetic (ADV §3). Pure: the campaign form imports this in the browser.

// What advertiser estimates assume until observed rates replace them (GLB §2.3).
export const EXPECTED_OPEN_RATE = { card: 0.036, featured: 0.055, video: 0.07, splash: 0.09 } as const

export type EstimatePlacement = keyof typeof EXPECTED_OPEN_RATE

export type EstimateInput = {
  budgetUsd: number
  placement: EstimatePlacement
  cpmCents: number
  rewardLocal: number
  fxPerUsd: number
  days: number
  capPct?: number
}

export type Estimate = {
  impressions: number
  perDay: number
  opens: number
  successfulShares: number
  rewardCents: number
  capCents: number
  budgetCents: number
  budgetLocal: number
}

export function estimate(i: EstimateInput): Estimate {
  const { budgetUsd, placement, cpmCents, rewardLocal, fxPerUsd, days, capPct = 20 } = i
  const budgetCents = budgetUsd * 100
  const capCents = (budgetCents * capPct) / 100
  const impressions = ((budgetCents - capCents) / cpmCents) * 1000
  const opens = impressions * EXPECTED_OPEN_RATE[placement]
  const successfulShares = opens * 0.09 * 2.2 * 0.3
  const rewardCents = Math.min(capCents, Math.round(((successfulShares * rewardLocal) / fxPerUsd) * 100))
  return {
    impressions,
    perDay: impressions / days,
    opens,
    successfulShares,
    rewardCents,
    capCents,
    budgetCents,
    budgetLocal: Math.round(budgetUsd * fxPerUsd),
  }
}

// limit − in use − this budget; on an edit, only the increase counts. Negative when over.
export function creditAfterCents(
  limitCents: number, inUseCents: number, budgetCents: number, isEdit = false, previousBudgetCents = 0,
): number {
  const added = isEdit ? Math.max(0, budgetCents - previousBudgetCents) : budgetCents
  return limitCents - inUseCents - added
}
