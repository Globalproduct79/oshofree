import { db } from '@/lib/db'
import { maskPhone } from '@/lib/format'
import { MARKETS, type Country } from '@/lib/markets'
import { monthBounds } from '@/lib/money'
import { AGGREGATOR_ID } from '@/lib/rewards'

// What the Rewards ledger page reads (GLB §2.5), beyond reports.rewardsLedgerRows.

export const LOW_BALANCE_CENTS = 50_000
export const FULL_BALANCE_CENTS = 200_000

// This month's earned rewards (queued, sent and held), what was sent, and what is still queued for the next run. A held
// reward is earned but waits for Global, so it is not "still queued".
export async function monthTotals(now: Date): Promise<{ earnedCents: number; sentCents: number; queuedCents: number }> {
  const workspaces = await db.workspace.findMany({ select: { id: true, country: true } })
  let earnedCents = 0
  let sentCents = 0
  let queuedCents = 0
  for (const ws of workspaces) {
    const { start, end } = monthBounds(ws.country, now)
    const rows = await db.rewardPayout.groupBy({
      by: ['status'],
      where: { workspaceId: ws.id, status: { in: ['queued', 'sent', 'held'] }, createdAt: { gte: start, lt: end } },
      _sum: { amountCents: true },
    })
    for (const r of rows) {
      earnedCents += r._sum.amountCents ?? 0
      if (r.status === 'sent') sentCents += r._sum.amountCents ?? 0
      if (r.status === 'queued') queuedCents += r._sum.amountCents ?? 0
    }
  }
  return { earnedCents, sentCents, queuedCents }
}

export async function aggregatorBalance(): Promise<number> {
  await db.aggregatorAccount.createMany({ data: [{ id: AGGREGATOR_ID, balanceCents: 0 }], skipDuplicates: true })
  return (await db.aggregatorAccount.findUniqueOrThrow({ where: { id: AGGREGATOR_ID } })).balanceCents
}

// The platform's most common points-per-share, default 10.
export async function commonPointsPerShare(): Promise<number> {
  const groups = await db.workspace.groupBy({ by: ['pointsPerShare'], _count: { _all: true } })
  if (!groups.length) return 10
  return groups.sort((a, b) => b._count._all - a._count._all || a.pointsPerShare - b.pointsPerShare)[0].pointsPerShare
}

export async function pointsIssued(): Promise<number> {
  return (await db.pointsLedger.aggregate({ _sum: { points: true } }))._sum.points ?? 0
}

export async function recentTopUps(): Promise<{ id: string; at: Date; amountCents: number; by: string }[]> {
  const rows = await db.aggregatorTopup.findMany({ orderBy: [{ at: 'desc' }, { id: 'desc' }], take: 5 })
  const users = await db.user.findMany({ where: { id: { in: rows.map((r) => r.byUserId) } }, select: { id: true, name: true } })
  const name = new Map(users.map((u) => [u.id, u.name]))
  return rows.map((r) => ({ id: r.id, at: r.at, amountCents: r.amountCents, by: name.get(r.byUserId) ?? 'Unknown' }))
}

export type HeldRow = {
  id: string
  campaignId: string
  workspaceId: string
  campaign: string
  workspace: string
  sharer: string
  local: string
  amountCents: number
  reason: string | null
  createdAt: Date
}

export async function heldPayouts(): Promise<HeldRow[]> {
  const rows = await db.rewardPayout.findMany({
    where: { status: 'held' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: { campaign: { select: { name: true, country: true } }, workspace: { select: { name: true } } },
  })
  const consumers = await db.consumer.findMany({
    where: { id: { in: rows.flatMap((r) => (r.sharerConsumerId ? [r.sharerConsumerId] : [])) } },
    select: { id: true, phone: true },
  })
  const phone = new Map(consumers.map((c) => [c.id, c.phone]))
  return rows.map((r) => {
    const p = r.sharerConsumerId ? phone.get(r.sharerConsumerId) : undefined
    const sharer = p ? maskPhone(p) : `Phoenix user · ••${(r.sharerSessionId ?? r.shareLinkId).slice(-4)}`
    return {
      id: r.id, campaignId: r.campaignId, workspaceId: r.workspaceId, campaign: r.campaign.name, workspace: r.workspace.name, sharer,
      local: `${MARKETS[r.campaign.country as Country].symbol}${r.amountLocal}`,
      amountCents: r.amountCents, reason: r.reason, createdAt: r.createdAt,
    }
  })
}
