import type { Campaign, PayoutStatus, ShareLink, Workspace } from '@prisma/client'
import { db, type Tx } from '@/lib/db'
import { dayBounds } from '@/lib/market-clock'

// The rewards ledger's three fraud checks (GLB §2.5, spec §6.7), toggled by Global. No server-only
// import: the seed calls ensureFraudRules.

export const FRAUD_RULES = [
  { key: 'same_device', label: 'Same device claims own share', action: 'blocked' },
  { key: 'per_sharer_daily', label: 'More than 5 rewards per sharer per day', action: 'held for review' },
  { key: 'phone_reuse', label: 'Phone number reused across 3+ sharers', action: 'held for review' },
] as const
export type FraudRuleKey = (typeof FRAUD_RULES)[number]['key']

// Global's "more than 5 rewards per sharer per day": the platform floor under every workspace's own cap.
export const PLATFORM_DAILY_LIMIT = 5
export const PHONE_REUSE_SHARERS = 3

// A payout that is neither blocked nor rejected is a successful share: it counts toward the daily caps.
export const COUNTED: PayoutStatus[] = ['queued', 'sent', 'held']
// Only queued and sent payouts are charged, so only they take up the campaign's reward cap; a held one
// is checked against the cap when Global releases it.
export const CHARGED: PayoutStatus[] = ['queued', 'sent']

export type PayoutReason = 'no_phone' | 'same_device' | 'cap_per_sharer' | 'platform_cap' | 'phone_reuse' | 'cap' | 'manual'
export type Verdict =
  | { status: 'queued'; reason: null }
  | { status: 'held' | 'blocked' | 'rejected'; reason: Exclude<PayoutReason, 'manual'> }

// Creates the three rows, enabled; re-running refreshes the words and keeps Global's toggles.
export async function ensureFraudRules(client: Tx = db): Promise<void> {
  for (const { key, label, action } of FRAUD_RULES) {
    await client.fraudRule.upsert({ where: { key }, create: { key, label, action, enabled: true }, update: { label, action } })
  }
}

// A rule with no row counts as enabled.
async function enabledRules(client: Tx): Promise<(key: FraudRuleKey) => boolean> {
  const off = new Set((await client.fraudRule.findMany({ where: { enabled: false }, select: { key: true } })).map((r) => r.key))
  return (key) => !off.has(key)
}

// The most a campaign may spend on rewards, in cents: its cap % of budget, never above the workspace's ceiling.
export function rewardCapCents(
  campaign: Pick<Campaign, 'budgetUsd' | 'rewardCapPct'>, workspace: Pick<Workspace, 'rewardCapPct'>,
): number {
  return campaign.budgetUsd * Math.min(campaign.rewardCapPct, workspace.rewardCapPct)
}

export type FraudInput = {
  link: Pick<ShareLink, 'id' | 'consumerId' | 'sharerSessionId'>
  campaign: Pick<Campaign, 'id' | 'workspaceId' | 'country' | 'budgetUsd' | 'rewardCapPct'>
  workspace: Pick<Workspace, 'rewardMaxPerSharerPerDay' | 'rewardCapPct'>
  // The friend's og_v cookie (landing page) and, from Phoenix, the friend's claim session.
  friendVisitorId?: string
  friendSessionId?: string
  // The friend's number when OshoFree already knows it at claim time; it is not re-checked later.
  friendPhone?: string | null
  amountCents: number
  now: Date
}

// The other sharers whose payouts came from claims made in a browser that has left this number on the
// landing page (a Consumer link minted from that browser carries the number and the browser's cookie).
// The number's own links are not other sharers, and a blocked payout reached no one.
async function sharersOfPhone(client: Tx, phone: string): Promise<{ owner: string | null; sharers: Set<string> }> {
  const owner = await client.consumer.findUnique({ where: { phone }, select: { id: true } })
  if (!owner) return { owner: null, sharers: new Set() }
  const rows = await client.$queryRaw<{ sharer: string }[]>`
    SELECT DISTINCT COALESCE(p."sharerConsumerId", p."sharerSessionId", p."shareLinkId") AS sharer
    FROM "ShareLink" f
    JOIN "LinkEvent" e ON e."visitorId" = f."sharerSessionId" AND e."type" = 'Claim'
    JOIN "RewardPayout" p ON p."claimEventKey" = e."id"
    WHERE f."consumerId" = ${owner.id} AND f."sharerType" = 'Consumer' AND f."sharerSessionId" IS NOT NULL
      AND p."status" <> 'blocked' AND p."sharerConsumerId" IS DISTINCT FROM ${owner.id}`
  return { owner: owner.id, sharers: new Set(rows.map((r) => r.sharer)) }
}

// What a successful share's payout becomes, checked in this order (spec §6.14.1, §6.14.2, §6.14.4):
//   1. the sharer has no known phone → held, no_phone (always on);
//   2. the friend claims from the sharer's own browser or Phoenix session → blocked, same_device;
//   3. the sharer already has their daily limit of successful shares → held: cap_per_sharer against the
//      workspace's own cap (this workspace's campaigns), platform_cap against Global's floor of 5 (every
//      campaign) while that rule is on — the effective limit is the lower of the two;
//   4. the friend's number already brought rewards to other sharers, making 3 or more with this one →
//      held, phone_reuse (the number's own links and blocked payouts do not count);
//   5. the campaign's charged rewards (queued and sent) would pass its cap % of budget (the lower of the
//      campaign's and the workspace's) → rejected, cap;
//   otherwise queued. "Today" is the campaign market's local day.
export async function evaluate(input: FraudInput, client: Tx = db): Promise<Verdict> {
  const { link, campaign, workspace, amountCents, now } = input
  const sharer = link.consumerId
  if (!sharer) return { status: 'held', reason: 'no_phone' }
  const on = await enabledRules(client)

  const own = link.sharerSessionId
  if (on('same_device') && own && (input.friendVisitorId === own || input.friendSessionId === own)) {
    return { status: 'blocked', reason: 'same_device' }
  }

  const { start, end } = dayBounds(campaign.country, now)
  const today = { sharerConsumerId: sharer, status: { in: COUNTED }, createdAt: { gte: start, lt: end } }
  // The workspace's own cap is checked first, so it names a tie (both limits at 5).
  if (await client.rewardPayout.count({ where: { ...today, workspaceId: campaign.workspaceId } }) >= workspace.rewardMaxPerSharerPerDay) {
    return { status: 'held', reason: 'cap_per_sharer' }
  }
  if (on('per_sharer_daily') && (await client.rewardPayout.count({ where: today })) >= PLATFORM_DAILY_LIMIT) {
    return { status: 'held', reason: 'platform_cap' }
  }

  if (on('phone_reuse') && input.friendPhone) {
    const { owner, sharers } = await sharersOfPhone(client, input.friendPhone)
    if (sharer !== owner) sharers.add(sharer)
    if (sharers.size >= PHONE_REUSE_SHARERS) return { status: 'held', reason: 'phone_reuse' }
  }

  const { _sum } = await client.rewardPayout.aggregate({
    where: { campaignId: campaign.id, status: { in: CHARGED } },
    _sum: { amountCents: true },
  })
  if ((_sum.amountCents ?? 0) + amountCents > rewardCapCents(campaign, workspace)) return { status: 'rejected', reason: 'cap' }

  return { status: 'queued', reason: null }
}
