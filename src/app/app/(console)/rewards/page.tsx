import { Box } from '@/components/og'
import { PageHead } from '@/components/shell/PageHead'
import { db } from '@/lib/db'
import { REWARDS } from '@/lib/copy-rewards'
import { usd } from '@/lib/format'
import { MARKETS } from '@/lib/markets'
import { can, requireMember } from '@/lib/permissions'
import { chargedBy, LIST_ORDER } from '@/lib/reports'
import { CapsForm, RewardsTable } from './RewardsClient'

// Rewards (ADV §6): airtime per successful share per campaign, and the workspace caps.
export default async function RewardsPage() {
  const { workspace: ws, role } = await requireMember('view')
  const editable = can(role, 'rewards')
  const campaigns = await db.campaign.findMany({
    where: { workspaceId: ws.id, status: { notIn: ['ended', 'rejected'] } },
    orderBy: LIST_ORDER,
  })
  const paid = await chargedBy(campaigns.map((c) => c.id), ['reward'])
  const rows = campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    country: MARKETS[c.country].name,
    currency: MARKETS[c.country].currency,
    rewardLocal: c.rewardLocal,
    paid: usd(paid.get(c.id) ?? 0),
    cap: usd(Math.round((c.budgetUsd * 100 * c.rewardCapPct) / 100)),
  }))
  return (
    <>
      <PageHead crumb={[{ label: ws.name }, { label: REWARDS.growth }, { label: REWARDS.crumb }]} title={REWARDS.title} lead={REWARDS.lead} />
      <div className="two">
        <Box title={REWARDS.perCampaign.title} sub={REWARDS.perCampaign.sub}>
          <RewardsTable rows={rows} editable={editable} />
        </Box>
        <div>
          <Box title={REWARDS.caps.title} sub={REWARDS.caps.sub}>
            <CapsForm
              initial={{ maxPerSharerPerDay: ws.rewardMaxPerSharerPerDay, capPct: ws.rewardCapPct, pointsPerShare: ws.pointsPerShare }}
              editable={editable}
            />
          </Box>
          <Box title={REWARDS.delivery.title} sub={REWARDS.delivery.text} />
        </div>
      </div>
    </>
  )
}
