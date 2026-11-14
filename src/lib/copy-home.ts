import type { HomeFilter } from '@/lib/campaign-filters'

// The Campaigns home's words (ADV §1, spec §6.8), verbatim. The hero's stat labels and the dashed
// tile print themselves (COMPONENTS in copy-components.ts); the pace notes are PACE in copy-campaign.ts.

export const HOME = {
  crumb: 'Campaigns',
  // Before 12 morning, before 18 afternoon, else evening, by the hour in the workspace's market.
  greeting: (hour: number) => (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'),
  title: (greeting: string, firstName: string) => (firstName ? `${greeting}, ${firstName}` : greeting),
  lead: 'Everything this workspace is running on Phoenix. The one that matters most is at the top.',
  newCampaign: '+ New campaign',
  // Scheduled and Rejected show only when the workspace has such campaigns (spec §6.8).
  pills: {
    all: 'All',
    live: 'Live',
    review: 'In review',
    paused: 'Paused',
    ended: 'Ended',
    scheduled: 'Scheduled',
    rejected: 'Rejected',
  } satisfies Record<HomeFilter, string>,
  // The section header under All; any other filter is headed by its pill's label.
  allCampaigns: 'All campaigns',
  pause: 'Pause',
  resume: 'Resume',
  open: 'Open campaign',
  empty: {
    title: 'Nothing on Phoenix yet',
    line: 'Create your first offer. It takes about five minutes.',
  },
  // Ours (Prompt 6): the New form's draft, kept in this browser, as a card that opens the form again.
  draft: {
    untitled: 'Untitled draft',
    notSent: 'Not submitted yet',
    carryOn: 'Carry on',
  },
} as const
