import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { POST as postShare } from '@/app/api/v1/share/route'
import { GET as getLanding } from '@/app/o/[code]/route'
import { POST as postClaim } from '@/app/o/[code]/claim/route'
import { campaignActivity, workspaceSharers } from '@/lib/activity'
import { campaignReport } from '@/lib/campaign-report'
import { hashKey } from '@/lib/channels'
import { ACTIVITY } from '@/lib/copy-activity'
import { db } from '@/lib/db'
import { localAmount, maskPhone } from '@/lib/format'
import { previousMarketDay, runDaily } from '@/lib/jobs/daily'
import { campaignMetrics, rewardsLedgerRows, workspaceSharing } from '@/lib/reports'
import { topUpAggregator } from '@/lib/rewards'
import { monthTotals } from '@/lib/rewards-ledger'

// Prompt 4: the referral journey end to end through the real routes, row by row — a Phoenix sharer with a number
// shares (POST /api/v1/share), a friend in a browser of their own opens the link and claims, the sharer's payout is
// queued with the campaign's airtime priced at its FX snapshot, the points and the ledger line are written, every
// reader agrees with the rows, and the daily job sends it from the aggregator balance.

const KEY = 'phx_journey_key'
const DAY = 86_400_000
const MSISDN = '+2348035550101'
const SESSION = 'phx-session-journey'

async function world() {
  const global = await db.user.create({ data: { email: 'g@oshofree.test', name: 'Global', passwordHash: 'x', isGlobalAdmin: true } })
  const ws = await db.workspace.create({ data: { name: 'Kola Bright', type: 'Brand', country: 'NG', status: 'approved' } })
  // Relative to the real clock: the landing routes and POST /share read the time themselves.
  const campaign = await db.campaign.create({
    data: {
      workspaceId: ws.id, name: 'Buy 2 get 1', brand: 'Kola Bright', country: 'NG', category: 'Food & drink',
      headline: 'Buy 2 Kola Bright, get 1 free', description: 'D', placement: 'card', redeemMethod: 'code', budgetUsd: 300,
      shareRewardLabel: '₦50 airtime', status: 'live', rewardLocal: 50, fxPerUsd: 1550, submittedAt: new Date(Date.now() - 2 * DAY),
      startsAt: new Date(Date.now() - DAY), endsAt: new Date(Date.now() + 7 * DAY),
    },
  })
  await db.channel.create({ data: { key: 'phoenix', name: 'Phoenix', apiKeyHash: hashKey(KEY), isLive: true } })
  // The market's rate moved after submission; the campaign's snapshot prices its rewards.
  await db.marketFx.create({ data: { country: 'NG', fxPerUsd: 1600, effectiveFrom: new Date(Date.now() - DAY) } })
  await topUpAggregator(10_000, global.id)
  return { ws, campaign }
}

const params = (code: string) => ({ params: Promise.resolve({ code }) })
const asVisitor = (visitor: string) => ({ cookie: `og_v=${visitor}`, 'user-agent': 'Mozilla/5.0 (Linux; Android 13)' })
const open = (code: string, visitor: string) =>
  getLanding(new Request(`http://localhost/o/${code}`, { headers: asVisitor(visitor) }), params(code))
const claim = (code: string, visitor: string) =>
  postClaim(new Request(`http://localhost/o/${code}/claim`, { method: 'POST', body: new URLSearchParams(), headers: asVisitor(visitor) }), params(code))
const share = (offerId: string) =>
  postShare(new Request('http://localhost/api/v1/share', {
    method: 'POST',
    headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ offer_id: offerId, session_id: SESSION, via: 'whatsapp', msisdn: MSISDN }),
  }))
const balance = async () => (await db.aggregatorAccount.findUniqueOrThrow({ where: { id: 'reloadly' } })).balanceCents
const rewardLines = (campaignId: string) => db.ledgerEntry.findMany({ where: { campaignId, kind: 'reward' } })

describe('the referral journey', () => {
  it('pays the sharer for a friend\'s claim once, at the FX snapshot, with points and a ledger line, and sends it on the daily job', async () => {
    const { ws, campaign } = await world()
    const sharer = maskPhone(MSISDN)
    const reward = localAmount(50, 'NG')

    // 1. The Phoenix user shares with their number: a link of their own, one level under the Root.
    const res = await share(campaign.id)
    expect(res.status).toBe(201)
    const { code } = (await res.json()) as { code: string }
    const link = await db.shareLink.findUniqueOrThrow({ where: { code }, include: { consumer: true } })
    expect(link).toMatchObject({ sharerType: 'Channel', depth: 1, sharerSessionId: SESSION, via: 'whatsapp' })
    expect(link.consumer?.phone).toBe(MSISDN)

    // 2. A friend in a browser of their own opens it: one counted Open on the sharer's link.
    const friend = randomUUID()
    expect((await open(code, friend)).status).toBe(200)
    expect(await db.linkEvent.findMany({ where: { linkId: link.id }, select: { type: true, visitorId: true, deduped: true } }))
      .toEqual([{ type: 'Open', visitorId: friend, deduped: false }])

    // 3. The friend claims: their own code, and the sharer's payout keyed by that Claim.
    const claimed = await claim(code, friend)
    expect(claimed.status).toBe(200)
    expect(await claimed.text()).toMatch(/PHX-[0-9A-Z]{4}/)
    const claimEvent = await db.linkEvent.findFirstOrThrow({ where: { linkId: link.id, type: 'Claim' } })
    const [payout, ...more] = await db.rewardPayout.findMany()
    expect(more).toEqual([])
    // ₦50 at the campaign's ₦1,550 (not the market's ₦1,600 now) is 3.23 cents: 3.
    expect(payout).toMatchObject({
      campaignId: campaign.id, workspaceId: ws.id, shareLinkId: link.id, claimEventKey: claimEvent.id,
      sharerConsumerId: link.consumerId, sharerSessionId: SESSION, amountLocal: 50, amountCents: 3, status: 'queued', reason: null,
      sentAt: null,
    })
    expect(await db.pointsLedger.findMany({ select: { id: true, consumerId: true, campaignId: true, points: true } })).toEqual([
      { id: `points:${payout.id}`, consumerId: link.consumerId, campaignId: campaign.id, points: 10 },
    ])
    expect(await rewardLines(campaign.id)).toMatchObject([
      { workspaceId: ws.id, amountCents: -3, description: 'Buy 2 get 1 — share rewards', dedupeKey: `reward:${payout.id}` },
    ])

    // 4. The friend claiming again, or opening again, pays nothing more.
    expect((await claim(code, friend)).status).toBe(200)
    expect((await open(code, friend)).status).toBe(200)
    expect(await db.rewardPayout.count()).toBe(1)
    expect(await rewardLines(campaign.id)).toHaveLength(1)
    expect(await db.pointsLedger.count()).toBe(1)

    // 5. Every reader agrees with the rows: the campaign page, Sharing, the sharer's row, the Rewards ledger.
    const metrics = await campaignMetrics(campaign.id, new Date())
    expect(metrics).toMatchObject({ sOpens: 1, sClaims: 1, shares: 1, rewardCents: 3, rewardLocal: 50 })
    const report = await campaignReport(campaign, ws, new Date())
    expect(report.sharing.cards.find((c) => c.title === 'Rewards paid')?.sub).toBe(`${reward} airtime`)
    expect(await workspaceSharing(ws.id)).toMatchObject({ shares: 1, sOpens: 1, sClaims: 1, rewardCents: 3 })
    const before = (await workspaceSharers(ws.id)).rows
    expect(before).toMatchObject([{ who: sharer, opened: 1, claimed: 1, rewards: `${reward} queued` }])
    expect(await rewardsLedgerRows()).toMatchObject([{ campaignId: campaign.id, successfulShares: 1, owedCents: 3 }])
    expect(await monthTotals(new Date())).toEqual({ earnedCents: 3, sentCents: 0 })

    // 6. The daily job sends it: sent, dated, and the aggregator balance down by exactly its cents.
    const now = new Date()
    expect(await runDaily(previousMarketDay(now), now, { replay: true })).toMatchObject({ payouts: 1, errors: [] })
    expect(await db.rewardPayout.findUniqueOrThrow({ where: { id: payout.id } })).toMatchObject({ status: 'sent', sentAt: now })
    expect(await balance()).toBe(10_000 - 3)
    expect((await workspaceSharers(ws.id)).rows).toMatchObject([{ who: sharer, rewards: `${reward} sent` }])
    expect(await monthTotals(new Date())).toEqual({ earnedCents: 3, sentCents: 3 })
    const lines = (await campaignActivity(campaign)).lines.map((l) => l.text)
    expect(lines.some((t) => t.startsWith(`${ACTIVITY.reward(reward, sharer, 'sent', null)} · `))).toBe(true)
    expect(lines.some((t) => t.startsWith(`${ACTIVITY.points(10, sharer)} · `))).toBe(true)

    // 7. Sending changed no money the advertiser sees: one ledger line, equal to the campaign's reward spend.
    const lines2 = await rewardLines(campaign.id)
    expect(lines2).toHaveLength(1)
    expect((await campaignMetrics(campaign.id, new Date())).rewardCents).toBe(-lines2[0].amountCents)

    // 8. A second run sends nothing again.
    expect(await runDaily(previousMarketDay(now), now, { replay: true })).toMatchObject({ payouts: 0 })
    expect(await balance()).toBe(10_000 - 3)
  })
})
