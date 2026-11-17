// The sidebar's groups, items, hrefs and counts (GLB §4.2, spec §6.12). Pure: the layouts pass the counts in.
import { can, type MemberRole } from '@/lib/capabilities'
import { SHELL } from '@/lib/copy-shell'

export type NavIcon =
  | 'home' | 'plus' | 'share' | 'gift' | 'card' | 'doc' | 'people' | 'cog' | 'bell'
  | 'check' | 'grid' | 'tag' | 'globe' | 'ledger' | 'code'
export type NavItem = { label: string; href: string; icon: NavIcon; count?: number }
export type NavGroup = { label: string; items: NavItem[] }
export type NavCounts = { campaigns: number; invoices: number; review: number }

const item = (label: string, href: string, icon: NavIcon, count = 0): NavItem =>
  count > 0 ? { label, href, icon, count } : { label, href, icon }

// New campaign only for a role that may create one: a Viewer opening it would land back on Campaigns.
export function navFor(ctx: { role: MemberRole; inWorkspace: boolean; counts: NavCounts }): NavGroup[] {
  const { nav, groups } = SHELL
  const { counts } = ctx
  const out: NavGroup[] = []
  if (ctx.inWorkspace) {
    out.push(
      { label: groups.campaigns, items: [
        item(nav.campaigns, '/app', 'home', counts.campaigns),
        ...(can(ctx.role, 'campaigns') ? [item(nav.newCampaign, '/app/campaigns/new', 'plus')] : []),
      ] },
      { label: groups.growth, items: [item(nav.sharing, '/app/sharing', 'share'), item(nav.rewards, '/app/rewards', 'gift')] },
      { label: groups.money, items: [
        item(nav.billing, '/app/billing', 'card'),
        item(nav.invoices, '/app/invoices', 'doc', counts.invoices),
      ] },
      // Organisation in the order a new workspace meets it: who you are, then who works here, then what happened.
      { label: groups.organisation, items: [
        item(nav.workspace, '/app/workspace', 'cog'),
        item(nav.people, '/app/people', 'people'),
        item(nav.notifications, '/app/notifications', 'bell'),
      ] },
    )
  }
  if (ctx.role === 'Global') {
    out.push({ label: groups.platform, items: [
      item(nav.review, '/admin/review', 'check', counts.review),
      item(nav.advertisers, '/admin/advertisers', 'grid'),
      item(nav.rates, '/admin/rates', 'tag'),
      item(nav.settlement, '/admin/settlement', 'globe'),
      item(nav.rewardsLedger, '/admin/rewards', 'ledger'),
      item(nav.api, '/admin/api', 'code'),
    ] })
  }
  return out
}

const CAMPAIGN_PAGE = /^\/app\/campaigns\/(?!new(?:\/|$))[^/]+$/
const EDIT_OFFER = /^\/app\/campaigns\/[^/]+\/edit$/

// "Campaigns" stays current on a campaign page; Edit offer is the New campaign form (ADV §3).
export function isCurrent(pathname: string | null, href: string): boolean {
  if (!pathname) return false
  if (href === '/app') return pathname === '/app' || CAMPAIGN_PAGE.test(pathname)
  if (href === '/app/campaigns/new') return pathname === href || EDIT_OFFER.test(pathname)
  return pathname === href || pathname.startsWith(`${href}/`)
}

// Where entering a workspace may land (Global's search, Live now cards, a held reward's line): a path in the
// console, with at most a plain query such as ?line=reward-… ; anything else lands on Campaigns.
export function inAppPath(next: string): string {
  return /^\/app(\/[\w-]+)*(\?[\w=&-]+)?$/.test(next) ? next : '/app'
}
