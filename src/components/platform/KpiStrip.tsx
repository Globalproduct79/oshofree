import { MetricCard } from '@/components/og'
import { REVIEW } from '@/lib/copy-review'
import { fmt, pct, usd } from '@/lib/format'
import type { PlatformKpis } from '@/lib/reports'

const K = REVIEW.kpi

// Review's four tiles (GLB §2.1 block 1). `waiting` is the queue's length (campaigns and revised offers).
// "Owed to Phoenix" is a projection at today's share; its line fills to the share.
export function KpiStrip({ kpis, waiting }: { kpis: PlatformKpis; waiting: number }) {
  const openRate = pct(kpis.openRate * kpis.impressions, kpis.impressions)
  return (
    <div className="mgrid">
      <MetricCard title={K.live} value={kpis.live} sub={K.waiting(waiting)} fill={100} />
      <MetricCard title={K.impressions} value={fmt(kpis.impressions)} sub={K.openRate(openRate)} fill={100} />
      <MetricCard title={K.charged} value={usd(kpis.grossCents)} sub={K.rewards(usd(kpis.rewardCents))} fill={100} />
      <MetricCard title={K.owed} value={usd(kpis.owedCents)} sub={K.kept(usd(kpis.keptCents))} fill={Math.round(kpis.share * 10_000) / 100} />
    </div>
  )
}
