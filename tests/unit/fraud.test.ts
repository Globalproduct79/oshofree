import { describe, expect, it } from 'vitest'
import type { PayoutStatus, Prisma, ShareLink } from '@prisma/client'
import { db } from '@/lib/db'
import { upsertConsumer } from '@/lib/consumers'
import { ensureFraudRules, evaluate, FRAUD_RULES, type FraudInput } from '@/lib/fraud'
import { mintRootLink } from '@/lib/links'

const DAY = 86_400_000
// 10:00 in Lagos (UTC+1): the market-local day began at 2026-11-13T23:00:00Z.
const NOW = new Date('2026-11-14T09:00:00Z')

let n = 0
type World = Awaited<ReturnType<typeof world>>

async function world(
  wsOver: Partial<Prisma.WorkspaceUncheckedCreateInput> = {},
  campaignOver: Partial<Prisma.CampaignUncheckedCreateInput> = {},
) {
  const ws = await db.workspace.create({ data: { name: `W${++n}`, type: 'Brand', country: 'NG', status: 'approved', ...wsOver } })
  const campaign = await db.campaign.create({
    data: {
      workspaceId: ws.id, name: 'Buy 2 get 1', brand: 'Kola Bright', country: 'NG', category: 'Food & drink',
      headline: 'H', description: 'D', placement: 'card', redeemMethod: 'code', budgetUsd: 100, shareRewardLabel: '₦50 airtime',
      status: 'live', rewardLocal: 50, fxPerUsd: 1500, startsAt: new Date(NOW.getTime() - DAY), endsAt: new Date(NOW.getTime() + 7 * DAY),
      ...campaignOver,
    },
  })
  const channel = await db.channel.upsert({
    where: { key: 'phoenix' }, update: {}, create: { key: 'phoenix', name: 'Phoenix', apiKeyHash: 'h', isLive: true },
  })
  const root = await mintRootLink(campaign.id, channel.id)
  return { ws, campaign, channel, root }
}

// A sharer's link one level down: with a phone it is a landing-page sharer's Consumer link (its session is the
// browser that minted it); without one it is a Phoenix sharer's Channel link.
async function sharerLink(w: World, phone: string | null, sessionId: string): Promise<ShareLink> {
  const consumer = phone ? await upsertConsumer(phone, 'NG') : null
  return db.shareLink.create({
    data: {
      code: `L${++n}`, campaignId: w.campaign.id, channelId: w.channel.id, parentId: w.root.id, depth: 1,
      sharerType: consumer ? 'Consumer' : 'Channel', sharerSessionId: sessionId, consumerId: consumer?.id,
    },
  })
}

const payouts = (w: World, link: ShareLink, statuses: PayoutStatus[], o: { at?: Date; amountCents?: number } = {}) =>
  db.rewardPayout.createMany({
    data: statuses.map((status) => ({
      campaignId: link.campaignId, workspaceId: w.ws.id, shareLinkId: link.id, sharerConsumerId: link.consumerId,
      sharerSessionId: link.sharerSessionId, claimEventKey: `k${++n}`, amountLocal: 50, amountCents: o.amountCents ?? 3,
      status, createdAt: o.at ?? NOW,
    })),
  })

const input = (w: World, link: ShareLink, over: Partial<FraudInput> = {}): FraudInput => ({
  link, campaign: w.campaign, workspace: w.ws, friendVisitorId: 'dev-friend', amountCents: 3, now: NOW, ...over,
})

const disable = (key: string) => db.fraudRule.update({ where: { key }, data: { enabled: false } })

const ADA = '+2348031234567'

describe('fraud rules', () => {
  it("seeds the rewards ledger's three checks, enabled, and re-seeding keeps Global's toggles", async () => {
    await ensureFraudRules()
    expect(await db.fraudRule.findMany({ orderBy: { key: 'asc' } })).toEqual([
      { key: 'per_sharer_daily', label: 'More than 5 rewards per sharer per day', action: 'held for review', enabled: true },
      { key: 'phone_reuse', label: 'Phone number reused across 3+ sharers', action: 'held for review', enabled: true },
      { key: 'same_device', label: 'Same device claims own share', action: 'blocked', enabled: true },
    ])
    expect(FRAUD_RULES.map((r) => r.key)).toEqual(['same_device', 'per_sharer_daily', 'phone_reuse'])
    await disable('same_device')
    await ensureFraudRules()
    expect((await db.fraudRule.findUniqueOrThrow({ where: { key: 'same_device' } })).enabled).toBe(false)
  })
})

describe('evaluate', () => {
  it('queues an ordinary successful share', async () => {
    const w = await world()
    expect(await evaluate(input(w, await sharerLink(w, ADA, 'dev-ada')))).toEqual({ status: 'queued', reason: null })
  })

  it('holds a sharer with no known phone before any other check, even a claim from their own device', async () => {
    const w = await world()
    const phoenix = await sharerLink(w, null, 'sess-1')
    expect(await evaluate(input(w, phoenix))).toEqual({ status: 'held', reason: 'no_phone' })
    expect(await evaluate(input(w, phoenix, { friendSessionId: 'sess-1' }))).toEqual({ status: 'held', reason: 'no_phone' })
  })

  it("blocks a claim from the sharer's own browser or Phoenix session, before the daily cap", async () => {
    const w = await world()
    const ada = await sharerLink(w, ADA, 'dev-ada')
    expect(await evaluate(input(w, ada, { friendVisitorId: 'dev-ada' }))).toEqual({ status: 'blocked', reason: 'same_device' })
    expect(await evaluate(input(w, ada, { friendVisitorId: 'dev-x', friendSessionId: 'dev-ada' }))).toEqual({
      status: 'blocked', reason: 'same_device',
    })
    await payouts(w, ada, ['queued', 'queued', 'queued', 'queued', 'queued'])
    expect(await evaluate(input(w, ada, { friendVisitorId: 'dev-ada' }))).toEqual({ status: 'blocked', reason: 'same_device' })
  })

  it('skips a disabled rule: same device then passes (a missing row counts as enabled)', async () => {
    const w = await world()
    const ada = await sharerLink(w, ADA, 'dev-ada')
    expect(await db.fraudRule.count()).toBe(0)
    expect(await evaluate(input(w, ada, { friendVisitorId: 'dev-ada' }))).toMatchObject({ reason: 'same_device' })
    await ensureFraudRules()
    await disable('same_device')
    expect(await evaluate(input(w, ada, { friendVisitorId: 'dev-ada' }))).toEqual({ status: 'queued', reason: null })
  })

  it("holds the sixth share of the day at the workspace's default cap of 5, counting held but not blocked or rejected", async () => {
    const w = await world()
    const ada = await sharerLink(w, ADA, 'dev-ada')
    await payouts(w, ada, ['queued', 'sent', 'held', 'held', 'blocked', 'rejected'])
    expect(await evaluate(input(w, ada))).toEqual({ status: 'queued', reason: null })
    await payouts(w, ada, ['queued'])
    // Both limits are 5: the advertiser's own cap names it.
    expect(await evaluate(input(w, ada))).toEqual({ status: 'held', reason: 'cap_per_sharer' })
  })

  it('applies the platform floor of 5 under a workspace cap of 8, and the workspace cap once the floor is off', async () => {
    const w = await world({ rewardMaxPerSharerPerDay: 8 })
    const ada = await sharerLink(w, ADA, 'dev-ada')
    await payouts(w, ada, ['queued', 'queued', 'queued', 'queued', 'queued'])
    expect(await evaluate(input(w, ada))).toEqual({ status: 'held', reason: 'platform_cap' })
    await ensureFraudRules()
    await disable('per_sharer_daily')
    expect(await evaluate(input(w, ada))).toEqual({ status: 'queued', reason: null })
    await payouts(w, ada, ['queued', 'queued', 'queued'])
    expect(await evaluate(input(w, ada))).toEqual({ status: 'held', reason: 'cap_per_sharer' })
  })

  it('applies a workspace cap below the floor', async () => {
    const w = await world({ rewardMaxPerSharerPerDay: 3 })
    const ada = await sharerLink(w, ADA, 'dev-ada')
    await payouts(w, ada, ['queued', 'queued'])
    expect(await evaluate(input(w, ada))).toEqual({ status: 'queued', reason: null })
    await payouts(w, ada, ['queued'])
    expect(await evaluate(input(w, ada))).toEqual({ status: 'held', reason: 'cap_per_sharer' })
  })

  it("counts the market's local day: 22:59 UTC yesterday is Lagos yesterday, 23:00 UTC is Lagos today", async () => {
    const w = await world()
    const ada = await sharerLink(w, ADA, 'dev-ada')
    await payouts(w, ada, ['queued', 'queued', 'queued', 'queued', 'queued'], { at: new Date('2026-11-13T22:59:59Z') })
    await payouts(w, ada, ['queued', 'queued', 'queued', 'queued'], { at: new Date('2026-11-13T23:00:00Z') })
    expect(await evaluate(input(w, ada))).toEqual({ status: 'queued', reason: null })
    await payouts(w, ada, ['queued'], { at: new Date('2026-11-14T22:59:59Z') })
    expect(await evaluate(input(w, ada))).toEqual({ status: 'held', reason: 'cap_per_sharer' })
  })

  it("counts the sharer's rewards from other advertisers toward the platform floor, never toward a workspace's own cap", async () => {
    const other = await world({ rewardMaxPerSharerPerDay: 8 })
    const there = await sharerLink(other, ADA, 'dev-ada')
    await payouts(other, there, ['queued', 'queued', 'queued'])
    const tight = await world({ rewardMaxPerSharerPerDay: 3 })
    const here = await sharerLink(tight, ADA, 'dev-ada-2')
    expect(await evaluate(input(tight, here))).toEqual({ status: 'queued', reason: null })
    await payouts(other, there, ['queued', 'queued'])
    expect(await evaluate(input(tight, here))).toEqual({ status: 'held', reason: 'platform_cap' })
  })

  describe('phone reuse', () => {
    const FRIEND = '+2348090000001'

    // The friend claimed from device dev-f on each sharer's link, then left their number from that device.
    async function friendClaimedOn(w: World, links: ShareLink[]) {
      for (const link of links) {
        const e = await db.linkEvent.create({ data: { linkId: link.id, type: 'Claim', visitorId: 'dev-f', ipHash: 'h', userAgent: 'ua', at: NOW } })
        await db.rewardPayout.create({
          data: {
            campaignId: link.campaignId, workspaceId: w.ws.id, shareLinkId: link.id, sharerConsumerId: link.consumerId,
            sharerSessionId: link.sharerSessionId, claimEventKey: e.id, amountLocal: 50, amountCents: 3, status: 'queued', createdAt: NOW,
          },
        })
      }
      const friend = await upsertConsumer(FRIEND, 'NG')
      await db.shareLink.create({
        data: {
          code: `F${++n}`, campaignId: w.campaign.id, channelId: w.channel.id, parentId: links[0].id, depth: 2,
          sharerType: 'Consumer', consumerId: friend.id, sharerSessionId: 'dev-f',
        },
      })
    }

    it("holds the payout of a third distinct sharer for one friend's phone; two sharers, or an unknown phone, pass", async () => {
      const w = await world()
      const a = await sharerLink(w, '+2348030000001', 'dev-a')
      const b = await sharerLink(w, '+2348030000002', 'dev-b')
      const c = await sharerLink(w, '+2348030000003', 'dev-c')
      await friendClaimedOn(w, [a, b])
      expect(await evaluate(input(w, c, { friendPhone: FRIEND }))).toEqual({ status: 'held', reason: 'phone_reuse' })
      expect(await evaluate(input(w, a, { friendPhone: FRIEND }))).toEqual({ status: 'queued', reason: null })
      expect(await evaluate(input(w, c))).toEqual({ status: 'queued', reason: null })
      expect(await evaluate(input(w, c, { friendPhone: '+2348090000009' }))).toEqual({ status: 'queued', reason: null })
      await ensureFraudRules()
      await disable('phone_reuse')
      expect(await evaluate(input(w, c, { friendPhone: FRIEND }))).toEqual({ status: 'queued', reason: null })
    })

    it('comes after the daily cap and before the campaign cap', async () => {
      const w = await world({}, { budgetUsd: 1 })
      const a = await sharerLink(w, '+2348030000001', 'dev-a')
      const b = await sharerLink(w, '+2348030000002', 'dev-b')
      const c = await sharerLink(w, '+2348030000003', 'dev-c')
      await friendClaimedOn(w, [a, b])
      // The budget's 20 % is 20 cents; 6 are spent, so 15 more would cross it.
      expect(await evaluate(input(w, c, { friendPhone: FRIEND, amountCents: 15 }))).toEqual({ status: 'held', reason: 'phone_reuse' })
      await payouts(w, c, ['queued', 'queued', 'queued', 'queued', 'queued'])
      expect(await evaluate(input(w, c, { friendPhone: FRIEND }))).toEqual({ status: 'held', reason: 'cap_per_sharer' })
    })
  })

  it('rejects a reward that would take the campaign past its cap % of budget, counting held but not blocked or rejected', async () => {
    // $100 × 20 % = 2,000 cents.
    const w = await world()
    const a = await sharerLink(w, '+2348030000001', 'dev-a')
    const b = await sharerLink(w, '+2348030000002', 'dev-b')
    await payouts(w, a, ['queued', 'sent'], { amountCents: 900 })
    await payouts(w, a, ['held'], { amountCents: 197 })
    await payouts(w, a, ['blocked', 'rejected'], { amountCents: 900 })
    expect(await evaluate(input(w, b, { amountCents: 3 }))).toEqual({ status: 'queued', reason: null })
    expect(await evaluate(input(w, b, { amountCents: 4 }))).toEqual({ status: 'rejected', reason: 'cap' })
  })

  it("caps at the lower of the campaign's percentage and the workspace's ceiling", async () => {
    const w = await world({ rewardCapPct: 10 }, { rewardCapPct: 20 })
    const a = await sharerLink(w, ADA, 'dev-a')
    await payouts(w, a, ['queued'], { amountCents: 998 })
    expect(await evaluate(input(w, a, { amountCents: 2 }))).toEqual({ status: 'queued', reason: null })
    expect(await evaluate(input(w, a, { amountCents: 3 }))).toEqual({ status: 'rejected', reason: 'cap' })
  })

  it('holds for the daily cap rather than rejecting for the campaign cap', async () => {
    const w = await world({}, { budgetUsd: 1 })
    const a = await sharerLink(w, ADA, 'dev-a')
    await payouts(w, a, ['queued', 'queued', 'queued', 'queued', 'queued'], { amountCents: 4 })
    expect(await evaluate(input(w, a, { amountCents: 4 }))).toEqual({ status: 'held', reason: 'cap_per_sharer' })
  })
})
