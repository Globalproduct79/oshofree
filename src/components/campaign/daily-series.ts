import { COPY } from '@/lib/copy'
import type { DailyPoint } from '@/lib/reports'
import { tokens } from '@/lib/tokens'

// The 14-day chart's series, colours and axis styling. Colours checked for colour-blind separation.

const D = COPY.campaign.daily

export type ChartPoint = DailyPoint & { label: string }

export const SERIES = {
  impressions: { label: D.saw, color: tokens.ink2 },
  linkOpens: { label: D.opened, color: tokens.blue },
  claimsOnChannel: { label: D.claimedOnChannel, color: tokens.accent },
  claimsViaLink: { label: D.claimedViaLink, color: tokens.tileColors[5] },
} as const

export const MARGIN = { top: 6, right: 4, bottom: 4, left: 0 }

export const AXIS = {
  tick: { fill: tokens.ink3, fontSize: 11 },
  axisLine: false,
  tickLine: false,
} as const

export const Y_AXIS = { ...AXIS, allowDecimals: false, width: 36 } as const

export const TOOLTIP = {
  cursor: { fill: tokens.line2 },
  contentStyle: {
    backgroundColor: tokens.card,
    border: `1px solid ${tokens.line}`,
    borderRadius: 10,
    fontSize: 12,
    padding: '8px 10px',
  },
  labelStyle: { color: tokens.ink, fontWeight: 600, marginBottom: 4 },
  itemStyle: { color: tokens.ink2, padding: 0 },
} as const
