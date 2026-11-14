import type { CampaignStatus, Prisma, WorkspaceStatus } from '@prisma/client'

// Statuses are stored (slice 2): approval and resume write scheduled or live, End campaign now and the
// daily job write ended, and the daily job starts scheduled flights. No status is derived from dates; whether a
// campaign is delivering is (isDelivering, below).

// Slice-1 names, kept so their callers compile: the stored status is the status.
export type EffectiveStatus = CampaignStatus
export const effectiveStatus: (c: { status: CampaignStatus }, now?: Date) => CampaignStatus = (c) => c.status

// endsAt is exclusive: the offer stops at midnight after its last day. People read the last day.
// Display only; the API keeps ends_at as the exclusive instant.
export function lastDay(endsAt: Date): Date {
  return new Date(endsAt.getTime() - 1)
}

// What Phoenix delivers, the offers feed lists and the landing page opens: live campaigns of approved
// workspaces whose flight is still running. A campaign is approved only inside an approved workspace, but a
// workspace declined later stops delivering at once; a flight stops at its end (the market's midnight) even
// before the daily job moves it to ended. One rule in two forms: isDelivering for a row already loaded with
// its workspace, deliveringWhere for a query.
const DELIVERING = { status: 'live', workspaceStatus: 'approved' } as const satisfies {
  status: CampaignStatus
  workspaceStatus: WorkspaceStatus
}

export type DeliveryFacts = { status: CampaignStatus; endsAt: Date; workspace: { status: WorkspaceStatus } }

export function isDelivering(c: DeliveryFacts, now = new Date()): boolean {
  return c.status === DELIVERING.status && c.endsAt > now && c.workspace.status === DELIVERING.workspaceStatus
}

export const deliveringWhere = (now = new Date()): Prisma.CampaignWhereInput => ({
  status: DELIVERING.status,
  endsAt: { gt: now },
  workspace: { status: DELIVERING.workspaceStatus },
})
