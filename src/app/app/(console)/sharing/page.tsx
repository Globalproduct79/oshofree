import Link from 'next/link'
import { SimulateDayButton } from '@/components/demo/SimulateDayButton'
import { Box, DataTable, EstimatePanel, HBarList, MetricCard, Steps, TokenChip } from '@/components/og'
import { PageHead } from '@/components/shell/PageHead'
import { SHARING } from '@/lib/copy-sharing'
import { db } from '@/lib/db'
import { demoControlsOn } from '@/lib/demo/controls'
import { fmt, pct, usd } from '@/lib/format'
import { MARKETS } from '@/lib/markets'
import { can, requireMember } from '@/lib/permissions'
import { pointsIssued, workspaceSharing } from '@/lib/reports'
import { simulateDayAction } from '../campaigns/actions'

const S = SHARING

// Sharing (ADV §5): totals over every campaign of the workspace, how a share works, the
// by-campaign table, where people share and the points issued. Until a campaign has been live on Phoenix the
// table holds one line saying so, with New campaign for those who can make one.
export default async function SharingPage() {
  const { user, workspace: ws, role } = await requireMember('view')
  const [s, points, wentLive] = await Promise.all([
    workspaceSharing(ws.id),
    pointsIssued(ws.id),
    db.campaign.count({ where: { workspaceId: ws.id, status: { in: ['live', 'paused', 'ended'] } } }),
  ])
  const viral = (s.opens === 0 ? 0 : s.sOpens / s.opens).toFixed(2)
  const steps = [
    {
      title: S.how.shareTitle,
      body: (
        <>
          {S.how.share.before}
          <TokenChip>{S.how.share.token}</TokenChip>
          {S.how.share.after}
        </>
      ),
    },
    {
      title: S.how.claimTitle,
      body: (
        <>
          {S.how.claim.before}
          <TokenChip>{S.how.claim.token}</TokenChip>
          {S.how.claim.after}
        </>
      ),
    },
    { title: S.how.earnTitle, body: S.how.earn(ws.pointsPerShare) },
  ]
  const rows = s.byCampaign.map((c) => [
    <>
      <b>{c.name}</b>
      <br />
      <small style={{ color: 'var(--ink3)' }}>{`${c.brand} · ${MARKETS[c.country].name}`}</small>
    </>,
    fmt(c.shares),
    fmt(c.sOpens),
    fmt(c.sClaims),
    c.viral.toFixed(2),
    usd(c.rewardCents),
  ])

  return (
    <>
      <PageHead
        crumb={[{ label: ws.name }, { label: S.growth }, { label: S.crumb }]}
        title={S.title}
        lead={S.lead}
        actions={demoControlsOn(user.isGlobalAdmin) && <SimulateDayButton action={simulateDayAction} />}
      />
      <div className="mgrid m4">
        <MetricCard title={S.kpi.shares.title} value={fmt(s.shares)} sub={S.kpi.shares.sub(s.campaigns)} fill={100} />
        <MetricCard title={S.kpi.opened.title} value={fmt(s.sOpens)} sub={S.kpi.opened.sub(viral)} fill={100} />
        <MetricCard title={S.kpi.claimed.title} value={fmt(s.sClaims)} sub={S.kpi.claimed.sub(pct(s.sClaims, s.sOpens))} fill={100} />
        <MetricCard title={S.kpi.rewards.title} value={usd(s.rewardCents)} sub={S.kpi.rewards.sub} fill={100} />
      </div>
      <div className="two">
        <div>
          <Box title={S.how.title} sub={S.how.sub}>
            <Steps steps={steps} />
          </Box>
          <Box title={S.byCampaign.title}>
            <DataTable
              head={S.byCampaign.head}
              rows={wentLive > 0 ? rows : []}
              emptyText={
                <>
                  {S.byCampaign.empty}
                  {can(role, 'campaigns') && (
                    <>
                      {' '}
                      <Link href="/app/campaigns/new">{S.byCampaign.newCampaign}</Link>
                    </>
                  )}
                </>
              }
              align={[undefined, 'right', 'right', 'right', 'right', 'right']}
              rowHref={(i) => `/app/campaigns/${s.byCampaign[i].id}`}
            />
          </Box>
        </div>
        <div>
          <Box title={S.where.title} sub={S.where.sub}>
            {s.shares > 0 && (
              <HBarList rows={s.channels.map((c) => ({ label: c.label, value: c.count, display: `${c.pct.toFixed(1)}%` }))} />
            )}
          </Box>
          <Box title={S.points.title}>
            <EstimatePanel label={S.points.label} big={fmt(points)} note={S.points.note(ws.pointsPerShare)} />
          </Box>
        </div>
      </div>
    </>
  )
}
