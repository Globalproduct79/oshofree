'use client'

import { useTransition } from 'react'
import { DataTable } from '@/components/og'
import { toast } from '@/components/shell/toast-store'
import { RATES } from '@/lib/copy-rates'
import { MARKETS, type Country } from '@/lib/markets'
import type { Placement } from '@prisma/client'
import { setFxAction, setRateAction } from './actions'

export type RatesRow = { country: Country; cpm: Record<Placement, number | null>; fx: number | null }

const PLACEMENTS: Placement[] = ['card', 'featured', 'video', 'splash']
const inputStyle = { width: 76, border: '1px solid var(--line)', borderRadius: 7, padding: '6px 8px' }
const fxFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

export function RatesTable({ rows, editable }: { rows: RatesRow[]; editable: boolean }) {
  const [, start] = useTransition()

  const run = (act: () => Promise<{ toast: string } | { error: string }>) =>
    start(async () => {
      const res = await act()
      toast('toast' in res ? res.toast : res.error)
    })

  // The action revalidates /admin/rates, so the page refreshes itself.
  // The prototype's native `change` event: fires once when the field is committed, not per keystroke.
  const commit = (el: HTMLInputElement, act: () => Promise<{ toast: string } | { error: string }>) => {
    if (el.value !== el.defaultValue) run(act)
  }

  const body = rows.map((r) => [
    <b key="c">{MARKETS[r.country].name}</b>,
    ...PLACEMENTS.map((p) => (
      <input
        key={`${r.country}-${p}-${r.cpm[p]}`}
        type="number"
        step="0.1"
        style={inputStyle}
        aria-label={`${MARKETS[r.country].name} ${RATES.placements[p]}`}
        defaultValue={r.cpm[p] === null ? '' : (r.cpm[p] / 100).toFixed(2)}
        disabled={!editable}
        onBlur={(e) => commit(e.target, () => setRateAction(r.country, p, e.target.valueAsNumber))}
      />
    )),
    <span key="fx" style={{ color: 'var(--ink2)' }}>
      {MARKETS[r.country].symbol}
      <input
        key={`${r.country}-fx-${r.fx}`}
        type="number"
        step="any"
        style={{ ...inputStyle, width: 90 }}
        aria-label={`${MARKETS[r.country].name} ${RATES.head[5]}`}
        defaultValue={r.fx === null ? '' : fxFmt.format(r.fx).replace(/,/g, '')}
        disabled={!editable}
        onBlur={(e) => commit(e.target, () => setFxAction(r.country, e.target.valueAsNumber))}
      />
    </span>,
  ])
  return <DataTable head={RATES.head} rows={body} emptyText="" />
}
