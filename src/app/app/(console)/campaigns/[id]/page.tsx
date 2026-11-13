import { notFound } from 'next/navigation'
import { previewOffers } from '@/app/app/(console)/campaigns/actions'
import { DailyChart } from '@/components/campaign/DailyChart'
import { Funnel } from '@/components/campaign/Funnel'
import { OfferCard } from '@/components/campaign/OfferCard'
import { PauseResume } from '@/components/campaign/PauseResume'
import { PreviewButton } from '@/components/campaign/PreviewButton'
import { SharingSection } from '@/components/campaign/SharingSection'
import { LinkButton } from '@/components/console/LinkButton'
import { PageHead } from '@/components/console/PageHead'
import { Box, Section } from '@/components/console/Section'
import { StatusPill } from '@/components/console/StatusPill'
import { campaignCard } from '@/lib/campaign-card'
import { effectiveStatus } from '@/lib/campaign-status'
import { COPY } from '@/lib/copy'
import { db } from '@/lib/db'
import { dayLabel } from '@/lib/format'
import { MARKETS } from '@/lib/markets'
import { campaignDaily, campaignFunnel, campaignSharing } from '@/lib/reports'
import { tokens } from '@/lib/tokens'
import { requireWorkspace } from '@/lib/workspaces'

const C = COPY.campaign

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ws = await requireWorkspace()
  // Scoped here; the report queries below take only an id this workspace owns.
  const campaign = await db.campaign.findFirst({ where: { id, workspaceId: ws.id } })
  if (!campaign) notFound()
  const now = new Date()
  const status = effectiveStatus(campaign, now)
  const [daily, funnels, sharing] = await Promise.all([
    campaignDaily(campaign.id, 14, now),
    campaignFunnel(campaign.id),
    campaignSharing(campaign.id),
  ])
  const card = campaignCard(campaign)
  const edit = `/app/campaigns/${campaign.id}/edit`

  return (
    <>
      <PageHead
        title={campaign.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {campaign.brand} · {MARKETS[campaign.country].name}
            <StatusPill status={status} />
          </span>
        }
        actions={
          <div className="flex flex-wrap items-start gap-2">
            {(status === 'live' || status === 'paused') && <PauseResume id={campaign.id} status={status} />}
            {status === 'rejected' && (
              <LinkButton primary href={edit}>
                {C.editAndResubmit}
              </LinkButton>
            )}
            {status === 'draft' && <LinkButton href={edit}>{C.editDraft}</LinkButton>}
            <PreviewButton mine={card} load={previewOffers.bind(null, campaign.country)} />
          </div>
        }
      />
      {status === 'rejected' && campaign.rejectReason && (
        <p
          role="status"
          className="-mt-4 mb-8 rounded-xl border px-4 py-3 text-sm"
          style={{ backgroundColor: tokens.amberSoft, borderColor: tokens.amberSoft, color: tokens.amber }}
        >
          {C.rejected(campaign.rejectReason)}
        </p>
      )}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-8">
          <Section title={C.daily.title}>
            <Box>
              <DailyChart points={daily.map((p) => ({ ...p, label: dayLabel(p.day) }))} />
            </Box>
          </Section>
          <Section title={C.funnel.title} subtitle={C.funnel.subtitle}>
            <Box className="flex flex-col gap-6">
              {funnels.length === 0 ? (
                <p className="text-sm" style={{ color: tokens.ink2 }}>
                  {C.funnel.empty}
                </p>
              ) : (
                funnels.map((f) => <Funnel key={f.channel} funnel={f} />)
              )}
            </Box>
          </Section>
          <Section title={C.sharing.title}>
            <SharingSection sharing={sharing} />
          </Section>
        </div>
        <aside className="lg:sticky lg:top-6">
          <OfferCard offer={card} />
        </aside>
      </div>
    </>
  )
}
