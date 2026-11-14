import 'server-only'
import type { Campaign } from '@prisma/client'
import type { HeroModel } from '@/components/og/HeroCampaignCard'
import { campaignFacts } from '@/lib/campaigns'
import { fd, fmt, initials, pct, usd } from '@/lib/format'
import { MARKETS } from '@/lib/markets'
import { campaignMetrics } from '@/lib/reports'
import { imageUrl } from '@/lib/storage'
import { tokens } from '@/lib/tokens'

// The hero card of the Campaigns home (ADV §1 item 3), every number formatted:
//   Impressions      fmt(imp), "{today} today" from the last of the 14 market-local days
//   Open rate        opens ÷ imp, "{opens} opened"
//   Shares → claims  the friend claims (successful shares), "{shares} shared · {rewards} rewards"
//   Budget           budget − spend (delivery + rewards), "left of {budget}", the bar at spend ÷ budget
export async function heroModel(c: Campaign, now: Date): Promise<HeroModel> {
  const [m, f] = await Promise.all([campaignMetrics(c.id, now), campaignFacts(c.id, now)])
  const { name: country, timezone } = MARKETS[c.country]
  return {
    status: c.status,
    country,
    placement: c.placement,
    endsOn: fd(c.endsAt, timezone),
    startsOn: fd(c.startsAt, timezone),
    headline: c.headline,
    brand: c.brand,
    name: c.name,
    imageUrl: c.creativeImageKey ? imageUrl(c.creativeImageKey) : null,
    color: c.tileColor ?? tokens.tileColors[0],
    initials: initials(c.brand),
    stats: {
      impressions: fmt(m.imp),
      today: fmt(m.days[m.days.length - 1] ?? 0),
      openRate: pct(m.opens, m.imp),
      opened: fmt(m.opens),
      shareClaims: fmt(m.sClaims),
      shared: fmt(m.shares),
      rewards: usd(m.rewardCents),
      left: usd(f.leftCents),
      budget: usd(c.budgetUsd * 100),
    },
    spendPct: f.spendPct,
    note: f.paceNote,
  }
}

// "Tunde Okafor" → "Tunde".
export const firstName = (name: string | null | undefined): string => name?.trim().split(/\s+/)[0] ?? ''
