import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { PayoutStatus, Prisma, ShareLink } from '@prisma/client'
import { POST as postClaim } from '@/app/o/[code]/claim/route'
import { POST as postDetails } from '@/app/o/[code]/details/route'
import { db } from '@/lib/db'
import { normalisePhone, upsertConsumer } from '@/lib/consumers'
import { recordClaim } from '@/lib/link-events'
import { mintChannelLink, mintRootLink } from '@/lib/links'
import {
  onSuccessfulShare, rejectPayout, releasePayout, sendQueuedPayouts, topUpAggregator,
} from '@/lib/rewards'

const DAY = 86_400_000
const NOW = new Date('2026-11-14T09:00:00Z')

let n = 0
type World = Awaited<ReturnType<typeof world>>

async function world(
  wsOver: Partial<Prisma.WorkspaceUncheckedCreateInput> = {},
  campaignOver: Partial<Prisma.CampaignUncheckedCreateInput> = {},
) {
  const user = await db.user.create({ data: { email: `g${++n}@oshofree.test`, name: 'Global', passwordHash: 'x', isGlobalAdmin: true } })
  const ws = await db.workspace.create({ data: { name: 'Kola Bright', type: 'Brand', country: 'NG', status: 'approved', ...wsOver } })
  // Relative to the real clock, so the landing page treats it as live.
  const campaign = await db.campaign.create({
    data: {
      workspaceId: ws.id, name: 'Buy 2 get 1', brand: 'Kola Bright', country: 'NG', category: 'Food & drink',
      headline: 'Buy 2 Kola Bright, get 1 free', description: 'D', placement: 'card', redeemMethod: 'code', budgetUsd: 100,
      shareRewardLabel: '₦50 airtime', status: 'live', rewardLocal: 50, fxPerUsd: 1500,
      startsAt: new Date(Date.now() - 30 * DAY), endsAt: new Date(Date.now() + 30 * DAY), ...campaignOver,
    },
  })
  const channel = await db.channel.upsert({
    where: { key: 'phoenix' }, update: {}, create: { key: 'phoenix', name: 'Phoenix', apiKeyHash: 'h', isLive: true },
  })
  const root = await mintRootLink(campaign.id, channel.id)
  return { user, ws, campaign, channel, root }
}

async function sharerLink(w: World, phone: string | null, sessionId: string): Promise<ShareLink> {
  const consumer = phone ? await upsertConsumer(phone, 'NG') : null
  return db.shareLink.create({
    data: {
      code: `L${++n}`, campaignId: w.campaign.id, channelId: w.channel.id, parentId: w.root.id, depth: 1,
      sharerType: consumer ? 'Consumer' : 'Channel', sharerSessionId: sessionId, consumerId: consumer?.id,
    },
  })
}

// A friend's Claim on the link: its id is the payout's key.
const claimOn = async (link: ShareLink, visitorId = `dev-${++n}`) =>
  (await db.linkEvent.create({ data: { linkId: link.id, type: 'Claim', visitorId, ipHash: 'h', userAgent: 'ua', at: NOW } })).id

const share = async (link: ShareLink, over: Partial<Parameters<typeof onSuccessfulShare>[0]> = {}) => {
  const friendVisitorId = over.friendVisitorId ?? `dev-${++n}`
  const claimEventKey = over.claimEventKey ?? (await claimOn(link, friendVisitorId))
  return onSuccessfulShare({ campaignId: link.campaignId, shareLinkId: link.id, now: NOW, ...over, claimEventKey, friendVisitorId })
}

const rewardLines = () => db.ledgerEntry.findMany({ where: { kind: 'reward' }, orderBy: { at: 'asc' } })
const points = () => db.pointsLedger.findMany({ orderBy: { createdAt: 'asc' } })
const balance = async () => (await db.aggregatorAccount.findUnique({ where: { id: 'reloadly' } }))?.balanceCents ?? null

const ADA = '+2348031234567'

describe('onSuccessfulShare', () => {
  it("queues the campaign's airtime, charges it to the campaign as a share-rewards line and gives the sharer the workspace's points", async () => {
    const w = await world({ pointsPerShare: 7 })
    const link = await sharerLink(w, ADA, 'dev-ada')
    const key = await claimOn(link)
    const payout = await share(link, { claimEventKey: key })
    // ₦50 at ₦1,500 to the dollar is 3.33 cents.
    expect(payout).toMatchObject({
      campaignId: w.campaign.id, workspaceId: w.ws.id, shareLinkId: link.id, sharerConsumerId: link.consumerId,
      sharerSessionId: 'dev-ada', claimEventKey: key, amountLocal: 50, amountCents: 3, status: 'queued', reason: null,
      createdAt: NOW, sentAt: null,
    })
    expect(await rewardLines()).toMatchObject([
      { workspaceId: w.ws.id, campaignId: w.campaign.id, description: 'Buy 2 get 1 — share rewards', amountCents: -3, at: NOW, dedupeKey: `reward:${payout.id}` },
    ])
    expect(await points()).toMatchObject([{ consumerId: link.consumerId, sharerSessionId: 'dev-ada', campaignId: w.campaign.id, points: 7 }])
  })

  it('creates one payout, one ledger line and one points award for a replayed claim, even at once', async () => {
    const w = await world()
    const link = await sharerLink(w, ADA, 'dev-ada')
    const [k1, k2, k3] = [await claimOn(link), await claimOn(link), await claimOn(link)]
    const first = await share(link, { claimEventKey: k1 })
    const again = await share(link, { claimEventKey: k1 })
    const racing = await Promise.all([1, 2, 3].map(() => share(link, { claimEventKey: k2 })))
    // Inside a caller's transaction (the landing page's claim) a replay must not abort it.
    const inTx = await db.$transaction(async (tx) => {
      const one = await onSuccessfulShare({ campaignId: link.campaignId, shareLinkId: link.id, claimEventKey: k3, friendVisitorId: 'f', now: NOW }, tx)
      const two = await onSuccessfulShare({ campaignId: link.campaignId, shareLinkId: link.id, claimEventKey: k3, friendVisitorId: 'f', now: NOW }, tx)
      return [one.id, two.id]
    })
    expect(again.id).toBe(first.id)
    expect(new Set(racing.map((p) => p.id)).size).toBe(1)
    expect(inTx[1]).toBe(inTx[0])
    expect(await db.rewardPayout.count()).toBe(3)
    expect(await rewardLines()).toHaveLength(3)
    expect(await points()).toHaveLength(3)
  })

  it("prices with the campaign's FX snapshot, else the market's current rate, and needs neither for a zero reward", async () => {
    const w = await world({}, { rewardLocal: 100, fxPerUsd: null })
    await db.marketFx.create({ data: { country: 'NG', fxPerUsd: 1600, effectiveFrom: new Date(NOW.getTime() - DAY) } })
    const link = await sharerLink(w, ADA, 'dev-ada')
    expect((await share(link)).amountCents).toBe(6)
    await db.campaign.update({ where: { id: w.campaign.id }, data: { fxPerUsd: 1500 } })
    expect((await share(link)).amountCents).toBe(7)
    await db.marketFx.deleteMany()
    await db.campaign.update({ where: { id: w.campaign.id }, data: { rewardLocal: 0, fxPerUsd: null } })
    const free = await share(link)
    expect(free).toMatchObject({ amountLocal: 0, amountCents: 0, status: 'queued' })
    // A zero reward still earns points but posts no empty ledger line.
    expect(await rewardLines()).toHaveLength(2)
    expect(await points()).toHaveLength(3)
  })

  it('awards points for a held share but charges nothing; a blocked or rejected share earns neither', async () => {
    const w = await world({}, { budgetUsd: 1, rewardLocal: 150 })
    const phoenix = await sharerLink(w, null, 'sess-1')
    const ada = await sharerLink(w, ADA, 'dev-ada')
    expect(await share(phoenix)).toMatchObject({ status: 'held', reason: 'no_phone', amountCents: 10, sharerConsumerId: null })
    expect(await share(ada, { friendVisitorId: 'dev-ada' })).toMatchObject({ status: 'blocked', reason: 'same_device' })
    // 20 % of $1 is 20 cents. The held 10 is not charged, so two queued 10s fit and a third does not.
    expect(await share(ada)).toMatchObject({ status: 'queued' })
    expect(await share(ada)).toMatchObject({ status: 'queued' })
    expect(await share(ada)).toMatchObject({ status: 'rejected', reason: 'cap' })
    expect(await rewardLines()).toHaveLength(2)
    expect((await points()).map((p) => [p.sharerSessionId, p.points]).sort()).toEqual([['dev-ada', 10], ['dev-ada', 10], ['sess-1', 10]])
  })

  it("lets held payouts take none of the campaign cap: genuine shares still queue, and releasing past the cap is refused", async () => {
    // 20 % of $1 is 20 cents; each share is 10. Two held payouts would fill the cap if they counted.
    const w = await world({}, { budgetUsd: 1, rewardLocal: 150 })
    const phoenix = await sharerLink(w, null, 'sess-1')
    const held = [await share(phoenix), await share(phoenix)]
    expect(held.map((p) => p.status)).toEqual(['held', 'held'])
    const ada = await sharerLink(w, ADA, 'dev-ada')
    expect(await share(ada)).toMatchObject({ status: 'queued' })
    await expect(releasePayout(held[0].id, w.user.id)).resolves.toMatchObject({ status: 'queued' })
    await expect(releasePayout(held[1].id, w.user.id)).rejects.toBe('CAP')
    expect((await db.rewardPayout.findUniqueOrThrow({ where: { id: held[1].id } })).status).toBe('held')
    expect(await rewardLines()).toHaveLength(2)
  })

  it('refuses a claim on a link with no sharer', async () => {
    const w = await world()
    await expect(onSuccessfulShare({ campaignId: w.campaign.id, shareLinkId: w.root.id, claimEventKey: await claimOn(w.root), friendVisitorId: 'v', now: NOW }))
      .rejects.toBe('INVALID')
    expect(await db.rewardPayout.count()).toBe(0)
  })

  it('pays only for a Claim on the same link: a missing event, an Open or a Claim on another link is NOT_A_CLAIM', async () => {
    const w = await world()
    const ada = await sharerLink(w, ADA, 'dev-ada')
    const bola = await sharerLink(w, '+2348030000002', 'dev-bola')
    const open = await db.linkEvent.create({ data: { linkId: ada.id, type: 'Open', visitorId: 'v', ipHash: 'h', userAgent: 'ua', at: NOW } })
    for (const claimEventKey of ['no-such-event', open.id, await claimOn(bola)]) {
      await expect(onSuccessfulShare({ campaignId: w.campaign.id, shareLinkId: ada.id, claimEventKey, friendVisitorId: 'v', now: NOW }))
        .rejects.toBe('NOT_A_CLAIM')
    }
    expect(await db.rewardPayout.count()).toBe(0)
  })
})

describe('releasePayout and rejectPayout', () => {
  it("releases a held payout to the queue, charges it once and audits it; a second release changes nothing", async () => {
    const w = await world()
    const held = await share(await sharerLink(w, null, 'sess-1'))
    const later = new Date(NOW.getTime() + 3600_000)
    const released = await releasePayout(held.id, w.user.id, later)
    expect(released).toMatchObject({ id: held.id, status: 'queued', reason: null })
    expect(await releasePayout(held.id, w.user.id, later)).toMatchObject({ status: 'queued' })
    expect(await rewardLines()).toMatchObject([{ amountCents: -3, at: later, dedupeKey: `reward:${held.id}`, description: 'Buy 2 get 1 — share rewards' }])
    expect(await points()).toHaveLength(1)
    expect(await db.auditEvent.findMany({ select: { action: true, targetType: true, targetId: true, workspaceId: true, actorId: true, before: true, after: true } }))
      .toEqual([{
        action: 'reward.release', targetType: 'RewardPayout', targetId: held.id, workspaceId: w.ws.id, actorId: w.user.id,
        before: { status: 'held', reason: 'no_phone' }, after: { status: 'queued' },
      }])
    await expect(releasePayout('nope', w.user.id)).rejects.toBe('NOT_FOUND')
  })

  it("refuses to release a held payout that would take the campaign's charged rewards past its cap", async () => {
    // 20 % of $1 is 20 cents; each share is 10.
    const w = await world({}, { budgetUsd: 1, rewardLocal: 150 })
    const held = await share(await sharerLink(w, null, 'sess-1'))
    const ada = await sharerLink(w, ADA, 'dev-ada')
    await share(ada)
    await db.rewardPayout.create({
      data: {
        campaignId: w.campaign.id, workspaceId: w.ws.id, shareLinkId: ada.id, sharerConsumerId: ada.consumerId,
        claimEventKey: await claimOn(ada), amountLocal: 150, amountCents: 10, status: 'sent', createdAt: NOW,
      },
    })
    await expect(releasePayout(held.id, w.user.id)).rejects.toBe('CAP')
    expect((await db.rewardPayout.findUniqueOrThrow({ where: { id: held.id } })).status).toBe('held')
    expect(await rewardLines()).toHaveLength(1)
  })

  it('rejects a held payout, takes back its points and audits it; a queued payout cannot be rejected', async () => {
    const w = await world()
    const held = await share(await sharerLink(w, null, 'sess-1'))
    const queued = await share(await sharerLink(w, ADA, 'dev-ada'))
    expect(await rejectPayout(held.id, w.user.id)).toMatchObject({ status: 'rejected', reason: 'manual' })
    expect(await rejectPayout(held.id, w.user.id)).toMatchObject({ status: 'rejected', reason: 'manual' })
    expect(await rejectPayout(queued.id, w.user.id)).toMatchObject({ status: 'queued', reason: null })
    const sess = await db.pointsLedger.aggregate({ where: { sharerSessionId: 'sess-1' }, _sum: { points: true } })
    expect(sess._sum.points).toBe(0)
    expect(await db.auditEvent.findMany({ select: { action: true, targetId: true, before: true, after: true } })).toEqual([
      { action: 'reward.reject', targetId: held.id, before: { status: 'held', reason: 'no_phone' }, after: { status: 'rejected', reason: 'manual' } },
    ])
    await expect(rejectPayout('nope', w.user.id)).rejects.toBe('NOT_FOUND')
  })
})

describe('the aggregator', () => {
  const queue = async (w: World, link: ShareLink, amounts: number[], status: PayoutStatus = 'queued') => {
    for (const amountCents of amounts) {
      // A second apart, in call order.
      await db.rewardPayout.create({
        data: {
          campaignId: w.campaign.id, workspaceId: w.ws.id, shareLinkId: link.id, sharerConsumerId: link.consumerId,
          claimEventKey: `q-${++n}`, amountLocal: 50, amountCents, status, createdAt: new Date(NOW.getTime() - DAY + n * 1000),
        },
      })
    }
  }

  it('sends queued payouts oldest first while the balance covers them, and leaves the rest queued', async () => {
    const w = await world()
    const ada = await sharerLink(w, ADA, 'dev-ada')
    await queue(w, ada, [3, 8, 3])
    await queue(w, ada, [1], 'held')
    await db.aggregatorAccount.create({ data: { balanceCents: 10 } })
    expect(await sendQueuedPayouts(NOW)).toEqual({ sent: 2, skipped: 1 })
    expect(await balance()).toBe(4)
    const rows = await db.rewardPayout.findMany({ orderBy: { createdAt: 'asc' } })
    expect(rows.map((p) => [p.amountCents, p.status, p.sentAt])).toEqual([
      [3, 'sent', NOW], [8, 'queued', null], [3, 'sent', NOW], [1, 'held', null],
    ])
    await topUpAggregator(4, w.user.id)
    expect(await sendQueuedPayouts(NOW)).toEqual({ sent: 1, skipped: 0 })
    expect(await balance()).toBe(0)
    expect(await sendQueuedPayouts(NOW)).toEqual({ sent: 0, skipped: 0 })
  })

  it('sends nothing but a free reward from an account never topped up', async () => {
    const w = await world()
    const ada = await sharerLink(w, ADA, 'dev-ada')
    await queue(w, ada, [3, 0])
    expect(await sendQueuedPayouts(NOW)).toEqual({ sent: 1, skipped: 1 })
    expect(await balance()).toBe(0)
  })

  it('tops up by a positive whole number of cents, records who did it and audits it', async () => {
    const w = await world()
    for (const bad of [0, -100, 1.5, Number.NaN]) await expect(topUpAggregator(bad, w.user.id)).rejects.toBe('INVALID')
    expect(await db.aggregatorTopup.count()).toBe(0)
    await topUpAggregator(50_000, w.user.id)
    await topUpAggregator(25_000, w.user.id)
    expect(await balance()).toBe(75_000)
    expect((await db.aggregatorTopup.findMany({ orderBy: { amountCents: 'desc' } })).map((t) => [t.amountCents, t.byUserId])).toEqual([
      [50_000, w.user.id], [25_000, w.user.id],
    ])
    const audits = await db.auditEvent.findMany({ where: { action: 'aggregator.topup' } })
    expect(audits.map((a) => [a.targetType, a.targetId, a.actorId, a.before, a.after])).toEqual(expect.arrayContaining([
      ['AggregatorAccount', 'reloadly', w.user.id, { balanceCents: 0 }, { balanceCents: 50_000 }],
      ['AggregatorAccount', 'reloadly', w.user.id, { balanceCents: 50_000 }, { balanceCents: 75_000 }],
    ]))
    expect(audits).toHaveLength(2)
  })
})

describe('the aggregator balance', () => {
  const MAX = 2_147_483_647

  it('refuses a top-up that would take the balance past what it holds, and changes nothing', async () => {
    const w = await world()
    await topUpAggregator(MAX - 10, w.user.id)
    await expect(topUpAggregator(11, w.user.id)).rejects.toBe('TOO_LARGE')
    await expect(topUpAggregator(MAX + 1, w.user.id)).rejects.toBe('TOO_LARGE')
    await expect(topUpAggregator(Number.POSITIVE_INFINITY, w.user.id)).rejects.toBe('TOO_LARGE')
    expect(await balance()).toBe(MAX - 10)
    expect(await db.aggregatorTopup.count()).toBe(1)
    expect(await db.auditEvent.count({ where: { action: 'aggregator.topup' } })).toBe(1)
    await topUpAggregator(10, w.user.id)
    expect(await balance()).toBe(MAX)
  })
})

describe("a friend's claim on the landing page", () => {
  const params = (code: string) => ({ params: Promise.resolve({ code }) })
  const claim = (code: string, visitor: string) =>
    postClaim(new Request(`http://localhost/o/${code}/claim`, { method: 'POST', body: new URLSearchParams(), headers: { cookie: `og_v=${visitor}` } }), params(code))
  const leaveDetails = (code: string, visitor: string, phone: string) =>
    postDetails(new Request(`http://localhost/o/${code}/details`, {
      method: 'POST', body: new URLSearchParams({ phone }), headers: { cookie: `og_v=${visitor}` },
    }), params(code))

  // A landing-page sharer: they open a Phoenix sharer's link, leave their number and get their own link.
  async function landingSharer(w: World, channelLink: ShareLink, phone: string) {
    const device = randomUUID()
    expect((await leaveDetails(channelLink.code, device, phone)).status).toBe(200)
    const consumer = await db.consumer.findUniqueOrThrow({ where: { phone: normalisePhone(phone, 'NG')! } })
    const link = await db.shareLink.findFirstOrThrow({ where: { parentId: channelLink.id, consumerId: consumer.id } })
    return { device, link }
  }

  it("pays the sharer once for a friend's first claim, blocks the sharer's own claim and pays nothing on the Root link", async () => {
    const w = await world()
    const channelLink = await mintChannelLink(w.campaign.id, w.channel.id, 'sess-1', 'whatsapp')
    const ada = await landingSharer(w, channelLink, '0803 123 4567')
    expect(ada.link).toMatchObject({ sharerType: 'Consumer', sharerSessionId: ada.device })

    const friend = randomUUID()
    expect((await claim(ada.link.code, friend)).status).toBe(200)
    const first = await db.linkEvent.findFirstOrThrow({ where: { linkId: ada.link.id, type: 'Claim' } })
    expect((await claim(ada.link.code, friend)).status).toBe(200)
    expect(await db.linkEvent.count({ where: { linkId: ada.link.id, type: 'Claim' } })).toBe(2)
    expect(await db.rewardPayout.findMany()).toMatchObject([
      { shareLinkId: ada.link.id, claimEventKey: first.id, sharerConsumerId: ada.link.consumerId, status: 'queued', amountCents: 3 },
    ])

    await claim(ada.link.code, ada.device)
    expect(await db.rewardPayout.findFirst({ where: { status: 'blocked' } })).toMatchObject({ shareLinkId: ada.link.id, reason: 'same_device' })

    await claim(w.root.code, randomUUID())
    expect(await db.rewardPayout.count()).toBe(2)
    expect(await rewardLines()).toHaveLength(1)
  })

  it("holds a Phoenix sharer's reward when Phoenix sent no number", async () => {
    const w = await world()
    const channelLink = await mintChannelLink(w.campaign.id, w.channel.id, 'sess-1', 'whatsapp')
    await claim(channelLink.code, randomUUID())
    expect(await db.rewardPayout.findMany()).toMatchObject([{ shareLinkId: channelLink.id, status: 'held', reason: 'no_phone', sharerSessionId: 'sess-1' }])
  })

  it('holds the third sharer a friend claims for once the friend has left their number from that device', async () => {
    const w = await world()
    const channelLink = await mintChannelLink(w.campaign.id, w.channel.id, 'sess-1', 'whatsapp')
    const a = await landingSharer(w, channelLink, '0803 000 0001')
    const b = await landingSharer(w, channelLink, '0803 000 0002')
    const c = await landingSharer(w, channelLink, '0803 000 0003')
    const friend = randomUUID()
    await claim(a.link.code, friend)
    await leaveDetails(a.link.code, friend, '0809 000 0001')
    await claim(b.link.code, friend)
    await claim(c.link.code, friend)
    const on = (link: ShareLink) => db.rewardPayout.findMany({ where: { shareLinkId: link.id }, select: { status: true, reason: true } })
    expect([await on(a.link), await on(b.link), await on(c.link)]).toEqual([
      [{ status: 'queued', reason: null }], [{ status: 'queued', reason: null }], [{ status: 'held', reason: 'phone_reuse' }],
    ])
  })

  it("does not count the friend's own blocked self-claim as one of the sharers their number reached", async () => {
    const w = await world()
    const channelLink = await mintChannelLink(w.campaign.id, w.channel.id, 'sess-1', 'whatsapp')
    const s = await landingSharer(w, channelLink, '0803 000 0001')
    const x = await landingSharer(w, channelLink, '0803 000 0002')
    const y = await landingSharer(w, channelLink, '0803 000 0003')
    // F leaves their number on S's link, then taps their own new link from the same browser.
    const f = await landingSharer(w, s.link, '0809 000 0001')
    await claim(f.link.code, f.device)
    await claim(s.link.code, f.device)
    await claim(x.link.code, f.device)
    await claim(y.link.code, f.device)
    const on = (link: ShareLink) => db.rewardPayout.findMany({ where: { shareLinkId: link.id }, select: { status: true, reason: true } })
    expect([await on(f.link), await on(s.link), await on(x.link), await on(y.link)]).toEqual([
      [{ status: 'blocked', reason: 'same_device' }],
      [{ status: 'queued', reason: null }],
      [{ status: 'queued', reason: null }],
      [{ status: 'held', reason: 'phone_reuse' }],
    ])
  })

  it('records a claim through recordClaim once per visitor per link, concurrently too', async () => {
    const w = await world()
    const ada = await sharerLink(w, ADA, 'dev-ada')
    const results = await Promise.all([1, 2, 3].map(() => recordClaim(ada.id, 'dev-friend', 'h', 'ua', NOW)))
    expect(results.filter((r) => r.first)).toHaveLength(1)
    expect(await db.linkEvent.count({ where: { type: 'Claim' } })).toBe(3)
    expect(await db.rewardPayout.count()).toBe(1)
  })
})
