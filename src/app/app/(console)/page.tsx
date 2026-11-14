import { DraftCard } from '@/components/campaign/DraftCard'
import { newCampaignDefaults } from '@/components/campaign/form/values'
import { HomeFilterPills } from '@/components/campaign/HomeFilterPills'
import { PauseResume } from '@/components/campaign/PauseResume'
import { SimulateDayButton } from '@/components/demo/SimulateDayButton'
import { CampaignCard, EmptyState, HeroCampaignCard, LinkButton, NewCampaignTile } from '@/components/og'
import { ArrivalToast } from '@/components/shell/ArrivalToast'
import { PageHead } from '@/components/shell/PageHead'
import { homePills, parseHomeFilter, pillShown, sectionTitle } from '@/lib/campaign-filters'
import { HOME } from '@/lib/copy-home'
import { INVITE_PAGE } from '@/lib/copy-people'
import { demoControlsOn } from '@/lib/demo/controls'
import { hourIn } from '@/lib/format'
import { firstName, heroModel } from '@/lib/home'
import { JOINED_PARAM } from '@/lib/invite-join'
import { MARKETS } from '@/lib/markets'
import { can, requireMember } from '@/lib/permissions'
import { homeCards } from '@/lib/reports'
import { simulateDayAction } from './campaigns/actions'

const NEW = '/app/campaigns/new'
const campaignHref = (id: string) => `/app/campaigns/${id}`

// Campaigns home (ADV §1): the greeting (to whoever is signed in), the pills, the campaign that matters most,
// then the grid.
// The filter is `?filter=`; one the workspace has no pill for reads as All. `?joined={workspace}` (where an invite
// lands) toasts whom they joined as, for that workspace only, once per tab for this person and workspace (a shared
// browser where a second person joins the same workspace still tells them).
type Search = { filter?: string | string[]; [JOINED_PARAM]?: string | string[] }

export default async function CampaignsHome({ searchParams }: { searchParams: Promise<Search> }) {
  const { user, workspace: ws, role } = await requireMember('view')
  const now = new Date()
  const q = await searchParams
  const joined = q[JOINED_PARAM] === ws.id && role !== 'Global'
  const asked = parseHomeFilter(q.filter)
  const first = await homeCards(ws.id, asked, now)
  const filter = pillShown(asked, first.counts) ? asked : 'all'
  const home = filter === asked ? first : await homeCards(ws.id, filter, now)
  const hero = home.hero && { id: home.hero.id, status: home.hero.status, model: await heroModel(home.hero, now) }
  // A Viewer sees the page without the controls that change anything (spec §6.2).
  const canAct = can(role, 'campaigns')
  const demo = demoControlsOn(user.isGlobalAdmin)
  const greeting = HOME.greeting(hourIn(now, MARKETS[ws.country].timezone))

  return (
    <>
      {joined && (
        <ArrivalToast message={INVITE_PAGE.joined(ws.name, role)} param={JOINED_PARAM} onceKey={`joined:${user.id}:${ws.id}`} />
      )}
      <PageHead
        crumb={[{ label: ws.name }, { label: HOME.crumb }]}
        title={HOME.title(greeting, firstName(user.name))}
        lead={HOME.lead}
        actions={
          (demo || canAct) && (
            <>
              {demo && <SimulateDayButton action={simulateDayAction} />}
              {canAct && (
                <LinkButton variant="primary" href={NEW}>
                  {HOME.newCampaign}
                </LinkButton>
              )}
            </>
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
        {/* The New form's draft waits here, in this browser, before the tile that starts another. */}
        {filter === 'all' && canAct && <DraftCard workspaceId={ws.id} defaults={newCampaignDefaults(ws, now)} />}
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
