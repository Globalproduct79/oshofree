// Every string the console shell shows (sidebar, topbar, bell, switcher, banner), verbatim from the
// prototype inventories (GLB §1.3 and §4, ADV §0 and §12) with "OfferGrid" read as "OshoFree".
import { COPY } from '@/lib/copy'

export const SHELL = {
  groups: {
    campaigns: 'Campaigns',
    growth: 'Growth',
    money: 'Money',
    organisation: 'Organisation',
    platform: 'Platform',
  },
  nav: {
    campaigns: 'Campaigns',
    newCampaign: 'New campaign',
    sharing: 'Sharing',
    rewards: 'Rewards',
    billing: 'Billing & credit',
    invoices: 'Invoices',
    people: 'People',
    workspace: 'Workspace',
    notifications: 'Notifications',
    review: 'Review',
    advertisers: 'Advertisers',
    rates: 'Rates',
    settlement: 'Phoenix settlement',
    rewardsLedger: 'Rewards ledger',
    api: 'Phoenix API',
  },
  brand: {
    product: 'OshoFree',
    tile: 'OF',
    platform: 'Platform console',
    workspaceSub: (type: string, country: string) => `${type} workspace · ${country}`,
  },
  version: (v: string) => `v${v}`,
  menu: 'Menu',
  // Ours (Prompt 10): a page that is not there, or that failed, said inside the shell with the way back.
  problem: {
    notHere: {
      title: "This page isn't here",
      line: 'The link may be old, or what it opens may belong to another workspace.',
    },
    failed: {
      title: "This page didn't load",
      line: 'Something went wrong on our side. Try again, or go back and carry on.',
      retry: 'Try again',
    },
    toCampaigns: 'Back to Campaigns',
    toReview: 'Back to Review',
    // An address that matches no page at all, outside the console (the root not-found).
    toStart: 'Go to OshoFree',
  },
  search: {
    label: 'Search',
    placeholder: 'Search campaigns, invoices, people…',
    placeholderGlobal: 'Search workspaces and campaigns…',
    kbd: '⌘K',
    empty: 'Nothing matches.',
    groups: { campaigns: 'Campaigns', invoices: 'Invoices', people: 'People', workspaces: 'Workspaces' },
  },
  bell: {
    label: 'Notifications',
    title: 'Notifications',
    empty: 'Nothing new.',
    // The prototype printed " · 3h ago" for an empty detail; the age alone reads better.
    line: (detail: string | null | undefined, age: string) => (detail ? `${detail} · ${age}` : age),
  },
  switcher: {
    button: 'Workspaces',
    title: 'Workspaces',
    label: (name: string) => `Workspace: ${name}`,
    platform: 'Platform (Global)',
    sub: (type: string, country: string) => `${type} · ${country}`,
    signOut: 'Sign out',
    globalAvatar: 'GL',
  },
  banner: {
    pending: {
      lead: 'Awaiting approval',
      text: '— Global checks new advertisers within one working day. You can build campaigns now; they go live once the workspace is approved.',
    },
    declined: { lead: 'Declined', text: (reason: string | null) => `— ${COPY.banner.declined(reason)}` },
    global: {
      lead: 'Platform',
      text: '— you are acting as Global. Approvals, rates and settlements here affect every advertiser.',
    },
    globalInside: { lead: 'Platform', text: (workspace: string) => `— you are acting as Global inside ${workspace}.` },
    back: 'Back to Platform',
  },
  crumbSep: ' › ',
} as const
