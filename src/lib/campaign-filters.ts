import type { EffectiveStatus } from '@/lib/campaign-status'

// The Home pills, in order. Scheduled sits under Live; draft and rejected show only under All.
export const STATUS_FILTERS = ['all', 'live', 'review', 'paused', 'ended'] as const
export type StatusFilter = (typeof STATUS_FILTERS)[number]

const PILL: Partial<Record<EffectiveStatus, StatusFilter>> = {
  live: 'live',
  scheduled: 'live',
  review: 'review',
  paused: 'paused',
  ended: 'ended',
}

export function parseStatusFilter(raw: unknown): StatusFilter {
  return (STATUS_FILTERS as readonly unknown[]).includes(raw) ? (raw as StatusFilter) : 'all'
}

export function inFilter(status: EffectiveStatus, filter: StatusFilter): boolean {
  return filter === 'all' || PILL[status] === filter
}

export function countByFilter(statuses: EffectiveStatus[]): Record<StatusFilter, number> {
  const counts = { all: 0, live: 0, review: 0, paused: 0, ended: 0 }
  for (const s of statuses) for (const f of STATUS_FILTERS) if (inFilter(s, f)) counts[f] += 1
  return counts
}

// The cards under the pills. Under All the hero is already at the top, so it is left out.
export function gridFor<T extends { id: string; status: EffectiveStatus }>(
  rows: T[],
  filter: StatusFilter,
  heroId: string | null,
): T[] {
  return rows.filter((r) => inFilter(r.status, filter) && !(filter === 'all' && r.id === heroId))
}
