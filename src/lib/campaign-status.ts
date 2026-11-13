import type { CampaignStatus, Prisma } from '@prisma/client'

export type EffectiveStatus = CampaignStatus | 'scheduled' | 'ended'

export function effectiveStatus(
  c: { status: CampaignStatus; startsAt: Date; endsAt: Date },
  now: Date,
): EffectiveStatus {
  if ((c.status === 'live' || c.status === 'paused') && c.endsAt <= now) return 'ended'
  if (c.status === 'live' && c.startsAt > now) return 'scheduled'
  return c.status
}

// endsAt is exclusive: the offer stops at midnight UTC after its last day. People read the last day.
// Display only; the API keeps ends_at as the exclusive instant.
export function lastDay(endsAt: Date): Date {
  return new Date(endsAt.getTime() - 1)
}

export function deliveringWhere(now: Date): Prisma.CampaignWhereInput {
  return {
    status: 'live',
    startsAt: { lte: now },
    endsAt: { gt: now },
    workspace: { status: 'approved' },
  }
}
