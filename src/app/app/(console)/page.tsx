import { HomeFilterPills } from '@/components/campaign/HomeFilterPills'
import { PauseResume } from '@/components/campaign/PauseResume'
import { CampaignCard, EmptyState, HeroCampaignCard, LinkButton, NewCampaignTile } from '@/components/og'
import { PageHead } from '@/components/shell/PageHead'
import { homePills, parseHomeFilter, pillShown, sectionTitle } from '@/lib/campaign-filters'
import { HOME } from '@/lib/copy-home'
import { hourIn } from '@/lib/format'
import { firstName, heroModel } from '@/lib/home'
import { MARKETS } from '@/lib/markets'
import { can, requireMember } from '@/lib/permissions'
import { homeCards } from '@/lib/reports'
import { ownerName } from '@/lib/shell'

const NEW = '/app/campaigns/new'
const campaignHref = (id: string) => `/app/campaigns/${id}`

// Campaigns home (ADV §1): the greeting, the pills, the campaign that matters most, then the grid.
// The filter is `?filter=`; one the workspace has no pill for reads as All.
export default async function CampaignsHome({ searchParams }: { searchParams: Promise<{ filter?: string | string[] }> }) {
  const { user, workspace: ws, role } = await requireMember('view')
  const now = new Date()
  const asked = parseHomeFilter((await searchParams).filter)
  const [first, owner] = await Promise.all([homeCards(ws.id, asked, now), ownerName(ws.id)])
  const filter = pillShown(asked, first.counts) ? asked : 'all'
  const home = filter === asked ? first : await homeCards(ws.id, filter, now)
  const hero = home.hero && { id: home.hero.id, status: home.hero.status, model: await heroModel(home.hero, now) }
  // A Viewer sees the page without the controls that change anything (spec §6.2).
  const canAct = can(role, 'campaigns')
  const greeting = HOME.greeting(hourIn(now, MARKETS[ws.country].timezone))

  return (
    <>
      <PageHead
        crumb={[{ label: ws.name }, { label: HOME.crumb }]}
        title={HOME.title(greeting, firstName(owner ?? user.name))}
        lead={HOME.lead}
        actions={
          canAct && (
            <LinkButton variant="primary" href={NEW}>
              {HOME.newCampaign}
            </LinkButton>
          )
        }
      />
      <HomeFilterPills options={homePills(home.counts)} value={filter} />
      {hero && (
        <HeroCampaignCard model={hero.model}>
          {canAct && (hero.status === 'live' || hero.status === 'paused') && (
            <PauseResume id={hero.id} status={hero.status} size="lg" />
          )}
          <LinkButton variant="dark" size="lg" href={campaignHref(hero.id)}>
            {HOME.open}
          </LinkButton>
        </HeroCampaignCard>
      )}
      <div className="sect">
        <h3>{sectionTitle(filter)}</h3>
        <span className="n">{home.cards.length}</span>
      </div>
      <div className="cards">
        {home.cards.map((c) => (
          <CampaignCard key={c.id} campaign={c} href={campaignHref(c.id)} />
        ))}
        {filter === 'all' && canAct && <NewCampaignTile href={NEW} />}
      </div>
      {home.counts.all === 0 && (
        <EmptyState box title={HOME.empty.title}>
          {HOME.empty.line}
        </EmptyState>
      )}
    </>
  )
}
