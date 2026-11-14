import 'server-only'
import type { RewardPayout } from '@prisma/client'
import { audit } from '@/lib/audit'
import { MONEY } from '@/lib/copy-money'
import { db, isUniqueViolation, type Tx } from '@/lib/db'
import { CHARGED, evaluate, rewardCapCents } from '@/lib/fraud'
import { postLedger } from '@/lib/money'
import { currentFx } from '@/lib/rates'

// A sharer's airtime for a friend's claim (spec §6.7, §6.14): the payout, its ledger line, the sharer's
// points, Global's review of held payouts, and the Reloadly balance that sends them.

export const AGGREGATOR_ID = 'reloadly'
const MAX_INT = 2_147_483_647
const SEND_BATCH = 1000

export type ShareInput = {
  campaignId: string
  shareLinkId: string
  // The id of the friend's first Claim LinkEvent on the link (else 'NOT_A_CLAIM'): one payout per key.
  claimEventKey: string
  friendVisitorId?: string
  friendSessionId?: string
  friendPhone?: string | null
  now?: Date
}

async function lock(tx: Tx, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`
}

// Payouts are serialised per sharer, then per campaign (always in that order), so the daily and campaign
// caps count every payout made before them. Releasing takes only the campaign lock.
const sharerLock = (tx: Tx, sharer: string) => lock(tx, `reward:sharer:${sharer}`)
const campaignLock = (tx: Tx, campaignId: string) => lock(tx, `reward:campaign:${campaignId}`)

// The points row of a payout has a known id, so a rejection can take back exactly what was given.
const pointsId = (payoutId: string) => `points:${payoutId}`

// The campaign's charge for a payout once it is queued; posting again changes nothing. A free reward posts
// no empty line.
async function chargeFor(tx: Tx, payout: RewardPayout, campaignName: string, at: Date): Promise<void> {
  if (!payout.amountCents) return
  await postLedger(payout.workspaceId, {
    at,
    description: MONEY.rewardsLine(campaignName),
    amountCents: -payout.amountCents,
    kind: 'reward',
    campaignId: payout.campaignId,
    dedupeKey: `reward:${payout.id}`,
  }, tx)
}

async function createPayout(tx: Tx, input: ShareInput): Promise<RewardPayout> {
  const now = input.now ?? new Date()
  const link = await tx.shareLink.findUnique({
    where: { id: input.shareLinkId },
    include: { campaign: { include: { workspace: true } } },
  })
  // A Root link has no sharer to pay.
  if (!link || link.campaignId !== input.campaignId || link.sharerType === 'Root') throw 'INVALID'
  // Only a friend's Claim on this very link pays.
  const claim = await tx.linkEvent.findUnique({ where: { id: input.claimEventKey }, select: { linkId: true, type: true } })
  if (!claim || claim.type !== 'Claim' || claim.linkId !== link.id) throw 'NOT_A_CLAIM'
  await sharerLock(tx, link.consumerId ?? link.sharerSessionId ?? link.id)
  await campaignLock(tx, link.campaignId)
  const existing = await tx.rewardPayout.findUnique({ where: { claimEventKey: input.claimEventKey } })
  if (existing) return existing

  const { campaign } = link
  const { workspace } = campaign
  const amountLocal = campaign.rewardLocal
  const fxPerUsd = !amountLocal ? 1 : campaign.fxPerUsd !== null ? Number(campaign.fxPerUsd) : await currentFx(campaign.country, now)
  const amountCents = Math.round((amountLocal / fxPerUsd) * 100)
  const verdict = await evaluate({
    link, campaign, workspace, amountCents, now,
    friendVisitorId: input.friendVisitorId, friendSessionId: input.friendSessionId, friendPhone: input.friendPhone,
  }, tx)
  const payout = await tx.rewardPayout.create({
    data: {
      campaignId: campaign.id, workspaceId: campaign.workspaceId, shareLinkId: link.id,
      sharerConsumerId: link.consumerId, sharerSessionId: link.sharerSessionId, claimEventKey: input.claimEventKey,
      amountLocal, amountCents, status: verdict.status, reason: verdict.reason, createdAt: now,
    },
  })
  if (payout.status === 'queued') await chargeFor(tx, payout, campaign.name, now)
  // A successful share earns points, held or not; a blocked or rejected one does not.
  if ((payout.status === 'queued' || payout.status === 'held') && workspace.pointsPerShare > 0) {
    await tx.pointsLedger.create({
      data: {
        id: pointsId(payout.id), consumerId: link.consumerId, sharerSessionId: link.sharerSessionId,
        campaignId: campaign.id, points: workspace.pointsPerShare, createdAt: now,
      },
    })
  }
  return payout
}

// A successful share: one payout per claim event, its status from the fraud checks. Inside the caller's
// transaction when given one (the landing page's claim), else in its own. A replay returns the first payout.
export async function onSuccessfulShare(input: ShareInput, tx?: Tx): Promise<RewardPayout> {
  if (tx) return createPayout(tx, input)
  try {
    return await db.$transaction((t) => createPayout(t, input))
  } catch (e) {
    // The unique key is the backstop for a replay that reached the database by another link.
    if (!isUniqueViolation(e)) throw e
    return db.rewardPayout.findUniqueOrThrow({ where: { claimEventKey: input.claimEventKey } })
  }
}

// Global releases a held payout to the queue and the campaign is charged for it — unless that would take
// the campaign's charged rewards past its cap ('CAP'; the payout stays held). A held payout took none of
// the cap, so this is its cap check. Releasing a payout that is not held changes nothing.
export async function releasePayout(id: string, byUserId: string, now = new Date()): Promise<RewardPayout> {
  const payout = await db.rewardPayout.findUnique({ where: { id } })
  if (!payout) throw 'NOT_FOUND'
  if (payout.status !== 'held') return payout
  const released = await db.$transaction(async (tx) => {
    await campaignLock(tx, payout.campaignId)
    const current = await tx.rewardPayout.findUniqueOrThrow({ where: { id } })
    if (current.status !== 'held') return false
    const campaign = await tx.campaign.findUniqueOrThrow({ where: { id: payout.campaignId }, include: { workspace: true } })
    const { _sum } = await tx.rewardPayout.aggregate({
      where: { campaignId: campaign.id, status: { in: CHARGED } },
      _sum: { amountCents: true },
    })
    if ((_sum.amountCents ?? 0) + current.amountCents > rewardCapCents(campaign, campaign.workspace)) throw 'CAP'
    const { count } = await tx.rewardPayout.updateMany({ where: { id, status: 'held' }, data: { status: 'queued', reason: null } })
    if (!count) return false
    await chargeFor(tx, current, campaign.name, now)
    return true
  })
  if (released) {
    await audit(byUserId, 'reward.release', { type: 'RewardPayout', id, workspaceId: payout.workspaceId },
      { status: 'held', reason: payout.reason }, { status: 'queued' })
  }
  return db.rewardPayout.findUniqueOrThrow({ where: { id } })
}

// Global rejects a held payout: nothing is charged and the share's points are taken back. Rejecting a
// payout that is not held changes nothing.
export async function rejectPayout(id: string, byUserId: string): Promise<RewardPayout> {
  const payout = await db.rewardPayout.findUnique({ where: { id } })
  if (!payout) throw 'NOT_FOUND'
  if (payout.status !== 'held') return payout
  const rejected = await db.$transaction(async (tx) => {
    const { count } = await tx.rewardPayout.updateMany({ where: { id, status: 'held' }, data: { status: 'rejected', reason: 'manual' } })
    if (!count) return false
    const given = await tx.pointsLedger.findUnique({ where: { id: pointsId(id) } })
    if (given) {
      await tx.pointsLedger.create({
        data: {
          id: `${pointsId(id)}:void`, consumerId: given.consumerId, sharerSessionId: given.sharerSessionId,
          campaignId: given.campaignId, points: -given.points,
        },
      })
    }
    return true
  })
  if (rejected) {
    await audit(byUserId, 'reward.reject', { type: 'RewardPayout', id, workspaceId: payout.workspaceId },
      { status: 'held', reason: payout.reason }, { status: 'rejected', reason: 'manual' })
  }
  return db.rewardPayout.findUniqueOrThrow({ where: { id } })
}

// The Reloadly account row, created empty if missing, locked for the rest of the transaction.
async function lockedBalance(tx: Tx): Promise<number> {
  await tx.aggregatorAccount.createMany({ data: [{ id: AGGREGATOR_ID, balanceCents: 0 }], skipDuplicates: true })
  const [{ balanceCents }] = await tx.$queryRaw<{ balanceCents: number }[]>`
    SELECT "balanceCents" FROM "AggregatorAccount" WHERE "id" = ${AGGREGATOR_ID} FOR UPDATE`
  return balanceCents
}

// Sends queued payouts oldest first while the aggregator balance covers each one; a payout the balance
// cannot cover stays queued for the next run, so the balance never goes below zero.
export async function sendQueuedPayouts(now = new Date()): Promise<{ sent: number; skipped: number }> {
  return db.$transaction(async (tx) => {
    let balance = await lockedBalance(tx)
    const queued = await tx.rewardPayout.findMany({
      where: { status: 'queued' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, amountCents: true },
    })
    const send: string[] = []
    for (const p of queued) {
      if (p.amountCents > balance) continue
      balance -= p.amountCents
      send.push(p.id)
    }
    for (let i = 0; i < send.length; i += SEND_BATCH) {
      const ids = send.slice(i, i + SEND_BATCH)
      const { count } = await tx.rewardPayout.updateMany({ where: { id: { in: ids }, status: 'queued' }, data: { status: 'sent', sentAt: now } })
      // Only this function moves a payout out of the queue, under the account lock.
      if (count !== ids.length) throw new Error('A queued payout changed while sending')
    }
    if (send.length) await tx.aggregatorAccount.update({ where: { id: AGGREGATOR_ID }, data: { balanceCents: balance } })
    return { sent: send.length, skipped: queued.length - send.length }
  }, { timeout: 30_000 })
}

// Global funds the aggregator: a positive whole number of cents, recorded and audited.
export async function topUpAggregator(amountCents: number, byUserId: string, now = new Date()): Promise<{ balanceCents: number }> {
  if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > MAX_INT) throw 'INVALID'
  const { before, after } = await db.$transaction(async (tx) => {
    const balance = await lockedBalance(tx)
    const account = await tx.aggregatorAccount.update({ where: { id: AGGREGATOR_ID }, data: { balanceCents: { increment: amountCents } } })
    await tx.aggregatorTopup.create({ data: { amountCents, byUserId, at: now } })
    return { before: balance, after: account.balanceCents }
  })
  await audit(byUserId, 'aggregator.topup', { type: 'AggregatorAccount', id: AGGREGATOR_ID }, { balanceCents: before }, { balanceCents: after })
  return { balanceCents: after }
}
