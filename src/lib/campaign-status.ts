import type { CampaignStatus, Prisma } from '@prisma/client'

// Statuses are stored (slice 2): approval and resume write scheduled or live, End campaign now and the
// daily job write ended, and the daily job starts scheduled flights. Nothing is derived from dates.

// Slice-1 names, kept so their callers compile: the stored status is the status.
export type EffectiveStatus = CampaignStatus
export const effectiveStatus: (c: { status: CampaignStatus }, now?: Date) => CampaignStatus = (c) => c.status

// endsAt is exclusive: the offer stops at midnight after its last day. People read the last day.
// Display only; the API keeps ends_at as the exclusive instant.
export function lastDay(endsAt: Date): Date {
  return new Date(endsAt.getTime() - 1)
}

// What Phoenix delivers and the offers feed lists: live campaigns of approved workspaces whose flight is
// still running. A campaign is approved only inside an approved workspace, but a workspace declined later
// stops delivering at once; a flight stops at its end (the market's midnight) even before the daily job
// moves it to ended.
export const deliveringWhere = (now = new Date()): Prisma.CampaignWhereInput => ({
  status: 'live',
  endsAt: { gt: now },
  workspace: { status: 'approved' },
})
