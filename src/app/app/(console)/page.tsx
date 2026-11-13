import type { Campaign } from '@prisma/client'
import { CampaignCard, NewCampaignCard } from '@/components/campaign/CampaignCard'
import { CampaignHero } from '@/components/campaign/CampaignHero'
import { StatusFilter } from '@/components/campaign/StatusFilter'
import { LinkButton } from '@/components/console/LinkButton'
import { PageHead } from '@/components/console/PageHead'
import { countByFilter, gridFor, parseStatusFilter } from '@/lib/campaign-filters'
import { effectiveStatus } from '@/lib/campaign-status'
import { COPY } from '@/lib/copy'
import { db } from '@/lib/db'
import { heroCampaign, homeNumbers } from '@/lib/reports'
import { imageUrl } from '@/lib/storage'
import { tokens } from '@/lib/tokens'
import { requireWorkspace } from '@/lib/workspaces'

const H = COPY.home
const thumb = (c: Campaign) => (c.creativeImageKey ? imageUrl(c.creativeImageKey) : null)

function Empty() {
  return (
    <div
      className="flex flex-col items-center gap-4 border px-6 py-14 text-center"
      style={{ borderRadius: tokens.radius, borderColor: tokens.line, backgroundColor: tokens.card }}
    >
      <p className="text-sm" style={{ color: tokens.ink2 }}>
        {H.empty}
      </p>
      <LinkButton primary href="/app/campaigns/new">
        {H.newCampaign}
      </LinkButton>
    </div>
  )
}

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ status?: string | string[] }> }) {
  const ws = await requireWorkspace()
  const now = new Date()
  const [campaigns, hero, shareRows] = await Promise.all([
    db.campaign.findMany({ where: { workspaceId: ws.id }, orderBy: { createdAt: 'desc' } }),
    heroCampaign(ws.id, now),
    db.shareLink.groupBy({
      by: ['campaignId'],
      where: { sharerType: { not: 'Root' }, campaign: { workspaceId: ws.id } },
      _count: { _all: true },
    }),
  ])
  const head = <PageHead title={COPY.page.campaigns.title} subtitle={COPY.page.campaigns.subtitle} />
  if (campaigns.length === 0)
    return (
      <>
        {head}
        <Empty />
      </>
    )

  const filter = parseStatusFilter((await searchParams).status)
  const rows = campaigns.map((c) => ({ id: c.id, status: effectiveStatus(c, now), campaign: c }))
  const grid = gridFor(rows, filter, hero?.id ?? null)
  const shares = new Map(shareRows.map((r) => [r.campaignId, r._count._all]))
  const numbers = hero ? await homeNumbers(hero.id, now) : null

  return (
    <>
      {head}
      {hero && numbers && (
        <CampaignHero campaign={hero} status={effectiveStatus(hero, now)} numbers={numbers} imageUrl={thumb(hero)} now={now} />
      )}
      <StatusFilter active={filter} counts={countByFilter(rows.map((r) => r.status))} />
      {grid.length === 0 && filter !== 'all' ? (
        <p className="py-6 text-sm" style={{ color: tokens.ink2 }}>
          {H.nothing}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {grid.map((r) => (
            <CampaignCard
              key={r.id}
              campaign={r.campaign}
              status={r.status}
              shares={shares.get(r.id) ?? 0}
              imageUrl={thumb(r.campaign)}
            />
          ))}
          <NewCampaignCard />
        </div>
      )}
    </>
  )
}
