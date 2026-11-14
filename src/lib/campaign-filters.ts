import { HOME } from '@/lib/copy-home'

// The Campaigns home's filter (ADV §1, spec §6.8): `?filter=` in the URL, so the page stays
// server-rendered and a workspace switch (which lands on /app) starts again at All.

export const HOME_FILTERS = ['all', 'live', 'review', 'paused', 'ended', 'scheduled', 'rejected'] as const
export type HomeFilter = (typeof HOME_FILTERS)[number]

// Always shown; Scheduled and Rejected join them only when the workspace has such campaigns.
const ALWAYS: readonly HomeFilter[] = ['all', 'live', 'review', 'paused', 'ended']

export const parseHomeFilter = (raw: unknown): HomeFilter =>
  (HOME_FILTERS as readonly unknown[]).includes(raw) ? (raw as HomeFilter) : 'all'

export const pillShown = (filter: HomeFilter, counts: Record<HomeFilter, number>): boolean =>
  ALWAYS.includes(filter) || counts[filter] > 0

export const homePills = (counts: Record<HomeFilter, number>) =>
  HOME_FILTERS.filter((f) => pillShown(f, counts)).map((key) => ({ key, label: HOME.pills[key], count: counts[key] }))

export const homeHref = (filter: HomeFilter): string => (filter === 'all' ? '/app' : `/app?filter=${filter}`)

export const sectionTitle = (filter: HomeFilter): string => (filter === 'all' ? HOME.allCampaigns : HOME.pills[filter])
