import { notFound } from 'next/navigation'
import { previewOffers } from '@/app/app/(console)/campaigns/actions'
import { ChangePanel } from '@/components/campaign/ChangePanel'
import { HistoryList } from '@/components/campaign/HistoryList'
import { OfferBox } from '@/components/campaign/OfferBox'
import { PauseResume } from '@/components/campaign/PauseResume'
import { PreviewButton } from '@/components/campaign/PreviewButton'
import { SharingBox } from '@/components/campaign/SharingBox'
import { BarChart14d, Box, Funnel, LinkButton, MetricCard, StatusBadge } from '@/components/og'
import { PageHead } from '@/components/shell/PageHead'
import { previewOffer } from '@/lib/campaign-card'
import { campaignReport } from '@/lib/campaign-report'
import { CAMPAIGN_COPY as C } from '@/lib/copy-report'
import { db } from '@/lib/db'
import { can, requireMember } from '@/lib/permissions'

const HOME = '/app'

// The campaign page (ADV §2): head and status line, the KPI row, impressions per day, the funnel and
// Sharing on the left; Change without review, The offer and History on the right. A Viewer sees it
// all without the controls that change anything (spec §6.2).
export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { workspace: ws, role } = await requireMember('view')
  // Scoped here; everything below reads only a campaign this workspace owns.
  const c = await db.campaign.findFirst({ where: { id, workspaceId: ws.id } })
  if (!c) notFound()
  const r = await campaignReport(c, ws, new Date())
  const canAct = can(role, 'campaigns')
  const running = c.status === 'live' || c.status === 'paused' ? c.status : null
  const { change } = r

  return (
    <>
      <PageHead
        crumb={[{ label: ws.name }, { label: C.crumb, href: HOME }, { label: c.name }]}
        title={c.headline}
        lead={r.lead}
        actions={
          <>
            {canAct && running && <PauseResume id={c.id} status={running} />}
            <PreviewButton
              mine={previewOffer(c)}
              country={c.country}
              load={previewOffers.bind(null, c.country)}
              label={C.seeOnPhoenix}
              variant="ghost"
            />
            <LinkButton variant="dark" href={HOME}>
              {C.back}
            </LinkButton>
          </>
        }
      />
      <div className="stl">
        <StatusBadge status={c.status} />
        {r.note && <span className={r.note.bad ? 'note bad' : 'note'}>{r.note.text}</span>}
      </div>
      <div className="mgrid">
        {r.kpis.map((m) => (
          <MetricCard key={m.title} title={m.title} value={m.value} sub={m.sub} fill={m.fill} />
        ))}
      </div>
      <div className="two">
        <div>
          <Box title={C.daily.title} sub={r.dailySub}>
            <BarChart14d values={r.days} />
          </Box>
          <Box title={C.funnel.title}>
            <Funnel rows={r.funnel.rows} base={r.funnel.base} />
          </Box>
          <SharingBox sharing={r.sharing} />
        </div>
        <div>
          {/* Keyed by the stored values, so a save redraws the fields from what was applied. */}
          <ChangePanel
            key={`${change.budgetUsd}|${change.endsOn}|${change.rewardLocal}`}
            id={c.id}
            change={change}
            readOnly={!canAct}
          />
          <OfferBox offer={r.offer} editHref={canAct ? `/app/campaigns/${c.id}/edit` : null} />
          <HistoryList lines={r.history} />
        </div>
      </div>
    </>
  )
}
