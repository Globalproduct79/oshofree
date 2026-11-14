import type { Campaign, ShareVia } from '@prisma/client'
import { uniform, type Rng } from '@/lib/demo/prng'
import { EXPECTED_OPEN_RATE } from '@/lib/estimate'

// The prototype's "Simulate a day" generator (ADV §15, GLB §5.2), as a plan of counts. Pure: the same
// campaign, facts and seed give the same day. Nothing here is a metric — simulate-day.ts posts the plan
// through the real pipeline, and the reports count what it stored.

// Of a day's budget, 88 % goes to delivery; the rest is headroom for the share rewards.
export const DELIVERY_SHARE = 0.88
export const CLAIM_RATE = 0.33
export const SHARE_RATE = 0.09
export const FRIEND_OPENS_PER_SHARE = 2.2
export const FRIEND_CLAIM_RATE = 0.3

export type SplitVia = Extract<ShareVia, 'whatsapp' | 'x' | 'facebook' | 'sms'>
// Where shares go, in % and in the prototype's order (it breaks a tie on the odd share).
export const SHARE_SPLIT: readonly (readonly [SplitVia, number])[] = [
  ['whatsapp', 62],
  ['x', 14],
  ['facebook', 16],
  ['sms', 8],
]

export type DayCampaign = Pick<Campaign, 'budgetUsd' | 'cpmCents' | 'placement'>
export type DayFacts = { spendCents: number; daysLeft: number }

export type DayPlan = {
  // The day's budget in cents, 88 % of it delivered.
  dayCents: number
  impressions: number
  opens: number
  claims: number
  shares: number
  friendOpens: number
  friendClaims: number
  via: Record<SplitVia, number>
}

// n shares by the split: each medium its whole part, the odd ones to the largest remainders (in whole
// hundredths, so no rounding error picks the medium).
function split(n: number): Record<SplitVia, number> {
  const parts = SHARE_SPLIT.map(([via, pct], i) => ({ via, i, whole: Math.floor((n * pct) / 100), rest: (n * pct) % 100 }))
  let odd = n - parts.reduce((a, p) => a + p.whole, 0)
  for (const p of [...parts].sort((a, b) => b.rest - a.rest || a.i - b.i)) {
    if (odd-- <= 0) break
    p.whole++
  }
  return Object.fromEntries(parts.map((p) => [p.via, p.whole])) as Record<SplitVia, number>
}

// One day of a live campaign (ADV §15): day = min(left, budget ÷ max(1, days left) × U(0.8, 1.3)); 88 % of it
// at the campaign's CPM snapshot is the impressions, never more than what is left would pay for; opens at the
// placement's open rate × U(0.85, 1.15); then 33 % claims, 9 % shares, 2.2 friend opens a share and 30 % of
// those claim. Nothing when the budget is spent or the campaign has no CPM to charge at.
export function generateDay(campaign: DayCampaign, facts: DayFacts, rng: Rng): DayPlan | null {
  const { cpmCents } = campaign
  const budgetCents = campaign.budgetUsd * 100
  const left = budgetCents - facts.spendCents
  if (left <= 0 || !cpmCents) return null
  const dayCents = Math.min(left, Math.round((budgetCents / Math.max(1, facts.daysLeft)) * uniform(rng, 0.8, 1.3)))
  const impressions = Math.min(
    Math.round(((dayCents * DELIVERY_SHARE) / cpmCents) * 1000),
    Math.floor((left * 1000) / cpmCents),
  )
  const opens = Math.round(impressions * EXPECTED_OPEN_RATE[campaign.placement] * uniform(rng, 0.85, 1.15))
  const shares = Math.round(opens * SHARE_RATE)
  const friendOpens = Math.round(shares * FRIEND_OPENS_PER_SHARE)
  return {
    dayCents,
    impressions,
    opens,
    claims: Math.round(opens * CLAIM_RATE),
    shares,
    friendOpens,
    friendClaims: Math.round(friendOpens * FRIEND_CLAIM_RATE),
    via: split(shares),
  }
}
