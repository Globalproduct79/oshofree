'use client'

import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { tokens } from '@/lib/tokens'
import { AXIS, MARGIN, SERIES, TOOLTIP, Y_AXIS, type ChartPoint } from './daily-series'

type Series = { label: string; color: string }

function Legend({ series }: { series: Series[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: tokens.ink2 }}>
      {series.map((s) => (
        <li key={s.label} className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
          {s.label}
        </li>
      ))}
    </ul>
  )
}

// Impressions run orders of magnitude above opens and claims, so they get their own panel
// over the same days rather than a second y-axis. Hovering one panel shows the day in both.
export function DailyChart({ points }: { points: ChartPoint[] }) {
  const gap = { stroke: tokens.card, strokeWidth: 1 }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Legend series={[SERIES.impressions]} />
        <ResponsiveContainer width="100%" height={110} initialDimension={{ width: 600, height: 110 }}>
          <BarChart data={points} margin={MARGIN} syncId="daily">
            <CartesianGrid vertical={false} stroke={tokens.line2} />
            <XAxis dataKey="label" hide />
            <YAxis {...Y_AXIS} tickCount={3} />
            <Tooltip {...TOOLTIP} />
            <Bar
              dataKey="impressions"
              name={SERIES.impressions.label}
              fill={SERIES.impressions.color}
              radius={[4, 4, 0, 0]}
              maxBarSize={18}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-col gap-2 border-t pt-4" style={{ borderColor: tokens.line2 }}>
        <Legend series={[SERIES.linkOpens, SERIES.claimsOnChannel, SERIES.claimsViaLink]} />
        <ResponsiveContainer width="100%" height={220} initialDimension={{ width: 600, height: 220 }}>
          <ComposedChart data={points} margin={MARGIN} syncId="daily">
            <CartesianGrid vertical={false} stroke={tokens.line2} />
            <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={16} />
            <YAxis {...Y_AXIS} />
            <Tooltip {...TOOLTIP} />
            <Bar
              dataKey="claimsOnChannel"
              name={SERIES.claimsOnChannel.label}
              stackId="claims"
              fill={SERIES.claimsOnChannel.color}
              maxBarSize={18}
              {...gap}
            />
            <Bar
              dataKey="claimsViaLink"
              name={SERIES.claimsViaLink.label}
              stackId="claims"
              fill={SERIES.claimsViaLink.color}
              radius={[4, 4, 0, 0]}
              maxBarSize={18}
              {...gap}
            />
            <Line
              dataKey="linkOpens"
              name={SERIES.linkOpens.label}
              type="monotone"
              stroke={SERIES.linkOpens.color}
              strokeWidth={2}
              dot={{ r: 3, fill: SERIES.linkOpens.color, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
