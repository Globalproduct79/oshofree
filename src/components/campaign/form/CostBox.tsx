import { EstimatePanel } from '@/components/og'
import type { CreditPosition } from '@/lib/campaign-schema'
import { CAMPAIGN_FORM_COPY as F } from '@/lib/copy-campaign-form'
import { creditAfterCents, estimate } from '@/lib/estimate'
import { fmt, loc, usd } from '@/lib/format'
import { MARKETS } from '@/lib/markets'
import { amount, flightLength, type FormValues } from './values'

const C = F.cost
const NONE = '—'

type Props = {
  values: FormValues
  // Phoenix's current CPM for the chosen placement and country, and the country's FX; null when unset.
  cpmCents: number | null
  fxPerUsd: number | null
  credit: CreditPosition
  // Edit offer: what the campaign's budget already holds in credit in use; only the increase counts.
  heldCents?: number
}

// ADV §3 "Cost box": impressions, opens and share rewards from the current rate card, the budget in
// both currencies, and the credit left after it. A figure that needs a missing rate shows a dash.
export function CostBox({ values: v, cpmCents, fxPerUsd, credit, heldCents }: Props) {
  const m = MARKETS[v.country]
  const budgetUsd = amount(v.budgetUsd)
  const reward = amount(v.rewardLocal)
  const days = flightLength(v)
  const e =
    cpmCents !== null && fxPerUsd !== null && days !== null
      ? estimate({ budgetUsd, placement: v.placement, cpmCents, rewardLocal: reward, fxPerUsd, days })
      : null
  const after = creditAfterCents(credit.limitCents, credit.inUseCents, budgetUsd * 100, heldCents !== undefined, heldCents ?? 0)
  return (
    <EstimatePanel
      label={C.impressions}
      big={e ? fmt(e.impressions) : NONE}
      note={e && days !== null ? C.perDay(fmt(e.perDay), days, fmt(e.opens)) : undefined}
      rows={[
        {
          label: C.placementCountry(F.placements[v.placement].name, m.name),
          value: cpmCents === null ? NONE : C.cpm((cpmCents / 100).toFixed(2)),
        },
        { label: C.rewards(e ? fmt(e.successfulShares) : NONE, m.symbol, reward), value: e ? usd(e.rewardCents) : NONE },
        { label: C.cap, value: C.capValue },
        {
          label: C.budget,
          value: (
            <>
              <b>{usd(budgetUsd * 100)}</b>
              {fxPerUsd !== null && ` · ${loc(budgetUsd * 100, v.country, fxPerUsd)}`}
            </>
          ),
        },
        { label: C.creditAfter, value: C.left(usd(after)) },
      ]}
    />
  )
}
