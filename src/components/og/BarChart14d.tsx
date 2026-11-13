import { Fragment } from 'react'
import { COMPONENTS } from '@/lib/copy-components'
import { fmt } from '@/lib/format'
import { tokens } from '@/lib/tokens'

const W = 700
const H = 170
const PAD = 20
const DAYS = 14
const BW = (W - PAD * 2) / DAYS

// The prototype's hand-drawn chart (GLB §6.5): 14 bars, oldest first, today last in the accent,
// "-13d … -1d, today" under them and the fmt() value as each bar's native tooltip. A shorter
// series is padded with empty days in front so today stays last.
export function BarChart14d({ values }: { values: readonly number[] }) {
  const days = [...Array<number>(DAYS).fill(0), ...values].slice(-DAYS)
  const max = Math.max(...days, 1)
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {days.map((v, i) => {
        const h = (Math.max(0, v) / max) * (H - 40)
        const today = i === DAYS - 1
        return (
          <Fragment key={i}>
            <rect
              x={PAD + i * BW + 4}
              y={H - 24 - h}
              width={BW - 8}
              height={h}
              rx={4}
              fill={today ? tokens.accent : tokens.chartPast}
            >
              <title>{fmt(v)}</title>
            </rect>
            <text x={PAD + i * BW + BW / 2} y={H - 8} fontSize={10} textAnchor="middle" fill={tokens.ink3}>
              {today ? COMPONENTS.chart.today : COMPONENTS.chart.daysAgo(DAYS - 1 - i)}
            </text>
          </Fragment>
        )
      })}
    </svg>
  )
}
