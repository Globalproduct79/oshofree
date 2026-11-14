import { describe, expect, it } from 'vitest'
import type { CampaignStatus, ChannelEventType, LedgerKind, PayoutStatus, Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { maskPhone } from '@/lib/format'
import {
  campaignDaily,
  campaignFunnel,
  campaignMetrics,
  campaignSharing,
  heroCampaign,
  homeCards,
  homeNumbers,
  platformKpis,
  pointsIssued,
  rewardsLedgerRows,
  settlementByMarket,
  workspaceSharing,
} from '@/lib/reports'

// Lagos is UTC+1 and Nairobi UTC+3, so 23:30 UTC is already tomorrow in both.
const NOW = new Date('2026-11-14T12:00:00Z')
const at = (iso: string) => new Date(iso)

let seq = 0
const next = () => ++seq

type CampaignRef = { id: string; workspaceId: string }

function mkCampaign(workspaceId: string, name: string, status: CampaignStatus, o: Partial<Prisma.CampaignUncheckedCreateInput> = {}) {
  return db.campaign.create({
    data: {
      workspaceId, name, brand: 'Kola Bright', country: 'NG', category: 'Food & drink', headline: `${name} headline`,
      description: 'd', placement: 'card', redeemMethod: 'code', budgetUsd: 100, shareRewardLabel: 'r', status,
      startsAt: at('2026-11-06T23:00:00Z'), endsAt: at('2026-11-20T23:00:00Z'), ...o,
    },
  })
}

const events = (c: CampaignRef, channelId: string, type: ChannelEventType, n: number, iso: string) =>
  db.channelEvent.createMany({
    data: Array.from({ length: n }, () => {
      const k = next()
      return { campaignId: c.id, channelId, type, sessionId: `s${k}`, at: at(iso), dedupeKey: `e${k}` }
    }),
  })

const link = (c: CampaignRef, channelId: string, depth: number, sharerType: 'Root' | 'Channel' | 'Consumer', o: Partial<Prisma.ShareLinkUncheckedCreateInput> = {}) =>
  db.shareLink.create({ data: { code: `L${next()}`, campaignId: c.id, channelId, depth, sharerType, ...o } })

const linkEvents = (linkId: string, n: number, o: { type?: 'Open' | 'Claim'; deduped?: boolean } = {}) =>
  db.linkEvent.createMany({
    data: Array.from({ length: n }, () => ({
      linkId, type: o.type ?? 'Open', visitorId: `v${next()}`, ipHash: 'i', userAgent: 'u', deduped: o.deduped ?? false, at: NOW,
    })),
  })

// The rewards engine comes later; payouts are written straight to the table.
const payouts = (
  c: CampaignRef, shareLinkId: string, statuses: PayoutStatus[],
  o: { sharerConsumerId?: string; sharerSessionId?: string; amountCents?: number } = {},
) =>
  db.rewardPayout.createMany({
    data: statuses.map((status) => ({
      campaignId: c.id, workspaceId: c.workspaceId, shareLinkId, claimEventKey: `claim${next()}`,
      amountLocal: 50, amountCents: o.amountCents ?? 3, status,
      sharerConsumerId: o.sharerConsumerId, sharerSessionId: o.sharerSessionId,
    })),
  })

const ledger = (c: CampaignRef, kind: LedgerKind, amountCents: number, iso: string, invoiceId?: string) =>
  db.ledgerEntry.create({ data: { workspaceId: c.workspaceId, campaignId: c.id, kind, amountCents, at: at(iso), description: 'x', invoiceId } })

const invoice = async (workspaceId: string, status: 'paid' | 'due') =>
  db.invoice.create({
    data: {
      workspaceId, number: `INV-${next()}`, period: at('2026-10-01T00:00:00Z'), amountCents: 0, fxPerUsd: 1550, status,
      country: (await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } })).country,
      issuedAt: at('2026-11-01T00:00:00Z'), dueAt: at('2026-11-15T00:00:00Z'),
    },
  })

// Kola Bright (NG) runs A (live, NG), B (paused, KE) and C (ended, NG); MediaSpec (KE) runs D (live,
// KE) and has one campaign in review.
async function world() {
  const phoenix = await db.channel.create({ data: { key: 'phoenix', name: 'Phoenix', apiKeyHash: 'h', isLive: true } })
  const kola = await db.workspace.create({ data: { name: 'Kola Bright', type: 'Brand', country: 'NG', status: 'approved' } })
  const media = await db.workspace.create({ data: { name: 'MediaSpec', type: 'Agency', country: 'KE', status: 'approved' } })
  const a = await mkCampaign(kola.id, 'Buy 2 get 1', 'live', {
    budgetUsd: 300, rewardLocal: 50, placement: 'featured', headline: 'Buy 2 bottles, get 1 free', tileColor: '#0F766E',
    submittedAt: at('2026-11-06T09:00:00Z'),
  })
  const b = await mkCampaign(kola.id, 'Pesa promo', 'paused', {
    country: 'KE', rewardLocal: 10, endsAt: at('2026-11-30T21:00:00Z'), submittedAt: at('2026-11-01T09:00:00Z'),
  })
  const c = await mkCampaign(kola.id, 'August multipack', 'ended', {
    budgetUsd: 50, startsAt: at('2026-08-01T00:00:00Z'), endsAt: at('2026-08-15T00:00:00Z'), submittedAt: at('2026-07-28T09:00:00Z'),
  })
  const d = await mkCampaign(media.id, 'Supa10 Jackpot', 'live', {
    country: 'KE', brand: 'Supa10', budgetUsd: 200, rewardLocal: 10, submittedAt: at('2026-11-03T09:00:00Z'),
  })
  await mkCampaign(media.id, 'Weekend cashback', 'review', { country: 'KE', brand: 'Supa10', submittedAt: at('2026-11-13T09:00:00Z') })

  // A: 23:30 UTC on the 13th is 00:30 on the 14th in Lagos (today); 22:30 UTC is 23:30 on the 13th.
  await events(a, phoenix.id, 'Impression', 3, '2026-11-13T23:30:00Z')
  await events(a, phoenix.id, 'Impression', 2, '2026-11-13T22:30:00Z')
  await events(a, phoenix.id, 'Impression', 4, NOW.toISOString())
  await events(a, phoenix.id, 'Impression', 1, '2026-10-20T10:00:00Z')
  await events(a, phoenix.id, 'Open', 5, NOW.toISOString())
  await events(a, phoenix.id, 'Claim', 2, NOW.toISOString())
  // Phoenix's own share events are stored for its stats page and never counted for the advertiser.
  await events(a, phoenix.id, 'Share', 1, NOW.toISOString())
  await events(a, phoenix.id, 'ShareOpen', 3, NOW.toISOString())
  await events(a, phoenix.id, 'ShareClaim', 2, NOW.toISOString())
  await events(d, phoenix.id, 'Impression', 2, '2026-11-10T10:00:00Z')
  await events(d, phoenix.id, 'Open', 1, '2026-11-10T10:00:00Z')

  const k1 = await db.consumer.create({ data: { phone: '+2348031234567', country: 'NG' } })
  const k2 = await db.consumer.create({ data: { phone: '+2348051112222', country: 'NG' } })
  const k3 = await db.consumer.create({ data: { phone: '+2348060000003', country: 'NG' } })

  const ch = phoenix.id
  const rootA = await link(a, ch, 0, 'Root')
  const p1 = await link(a, ch, 1, 'Channel', { parentId: rootA.id, sharerSessionId: 'sess-abcd1234', via: 'whatsapp' })
  const p2 = await link(a, ch, 1, 'Channel', { parentId: rootA.id, sharerSessionId: 'sess-ffff0001', consumerId: k1.id, via: 'whatsapp' })
  const p3 = await link(a, ch, 1, 'Channel', { parentId: rootA.id, sharerSessionId: 's3', via: 'x' })
  await link(a, ch, 1, 'Channel', { parentId: rootA.id, sharerSessionId: 's4', via: 'sms' })
  await link(a, ch, 1, 'Channel', { parentId: rootA.id, sharerSessionId: 's5', via: 'copy' })
  await link(a, ch, 1, 'Channel', { parentId: rootA.id, sharerSessionId: 's6' }) // minted, never sent: not a share
  const c1 = await link(a, ch, 2, 'Consumer', { parentId: p1.id, consumerId: k2.id, via: 'facebook' })
  await link(a, ch, 2, 'Consumer', { parentId: p1.id, consumerId: k3.id }) // left a number, never shared
  const c3 = await link(a, ch, 2, 'Consumer', { parentId: p3.id, consumerId: k1.id, via: 'whatsapp' })

  const rootB = await link(b, ch, 0, 'Root')
  const b1 = await link(b, ch, 1, 'Channel', { parentId: rootB.id, sharerSessionId: 'sb1', via: 'facebook' })
  await link(b, ch, 1, 'Channel', { parentId: rootB.id, sharerSessionId: 'sb2', via: 'facebook' })
  await link(b, ch, 1, 'Channel', { parentId: rootB.id, sharerSessionId: 'sb3', via: 'facebook' })
  const rootD = await link(d, ch, 0, 'Root')
  const d1 = await link(d, ch, 1, 'Channel', { parentId: rootD.id, sharerSessionId: 'sd1', via: 'whatsapp' })

  // Friend opens: depth ≥ 1 only, deduped rows left out. A: 5 + 2 + 3 = 10.
  await linkEvents(rootA.id, 2)
  await linkEvents(p1.id, 5)
  await linkEvents(p1.id, 1, { deduped: true })
  await linkEvents(p1.id, 2, { type: 'Claim' })
  await linkEvents(p2.id, 2)
  await linkEvents(c1.id, 3)
  await linkEvents(d1.id, 1)

  // Successful shares: payouts not blocked or rejected. A: 4 + 2 + 1 + 1 = 8.
  await payouts(a, p1.id, ['queued', 'queued', 'sent', 'sent', 'blocked'], { sharerSessionId: 'sess-abcd1234' })
  await payouts(a, p2.id, ['sent', 'held'], { sharerConsumerId: k1.id })
  await payouts(a, c3.id, ['queued'], { sharerConsumerId: k1.id })
  await payouts(a, c1.id, ['rejected', 'queued'], { sharerConsumerId: k2.id })
  await payouts(b, b1.id, ['queued'], { sharerSessionId: 'sb1', amountCents: 8 })
  await payouts(d, d1.id, ['queued', 'queued'], { sharerSessionId: 'sd1', amountCents: 8 })

  const kolaPaid = await invoice(kola.id, 'paid')
  const mediaPaid = await invoice(media.id, 'paid')
  const mediaDue = await invoice(media.id, 'due')
  // Lagos November runs from 31 Oct 23:00 UTC; Nairobi November from 31 Oct 21:00 UTC.
  await ledger(a, 'delivery', -333, '2026-10-31T23:30:00Z')
  await ledger(a, 'delivery', -1200, '2026-11-10T10:00:00Z')
  await ledger(a, 'delivery', -300, '2026-10-20T10:00:00Z')
  await ledger(a, 'reward', -24, '2026-11-12T10:00:00Z')
  await ledger(b, 'delivery', -101, '2026-11-05T10:00:00Z')
  await ledger(b, 'reward', -8, '2026-10-15T10:00:00Z', kolaPaid.id)
  await db.ledgerEntry.create({ data: { workspaceId: kola.id, kind: 'payment', amountCents: 500, at: at('2026-11-02T10:00:00Z'), description: 'paid' } })
  await ledger(d, 'delivery', -155, '2026-10-31T21:30:00Z')
  await ledger(d, 'delivery', -50, '2026-10-31T20:30:00Z')
  await ledger(d, 'reward', -10, '2026-11-08T10:00:00Z', mediaPaid.id)
  await ledger(d, 'reward', -6, '2026-11-12T10:00:00Z', mediaDue.id)

  await db.pointsLedger.createMany({
    data: [{ campaignId: a.id, points: 50 }, { campaignId: a.id, points: 30 }, { campaignId: b.id, points: 10 }, { campaignId: d.id, points: 20 }],
  })
  await db.channelShare.createMany({
    data: [
      { channelId: ch, share: 0.6, effectiveFrom: at('2026-11-01T00:00:00Z') },
      { channelId: ch, share: 0.7, effectiveFrom: at('2026-11-20T00:00:00Z') },
      { channelId: ch, share: 0.5, effectiveFrom: at('2026-12-01T00:00:00Z') },
    ],
  })
  return { phoenix, kola, media, a, b, c, d, k1, k2 }
}

describe('campaignMetrics', () => {
  it('counts every number from its rows', async () => {
    const { a, k1, k2 } = await world()
    const { days, ...m } = await campaignMetrics(a.id, NOW)
    expect(m).toEqual({
      imp: 10,
      opens: 5,
      claims: 2,
      // Channel and Consumer links with a medium: not the root, not the unsent one, not the friend who never shared.
      shares: 7,
      sOpens: 10,
      // Payouts, not raw claims: the blocked and the rejected one are out, the held one is in.
      sClaims: 8,
      spendCents: 333 + 1200 + 300 + 24,
      rewardCents: 24,
      channels: { whatsapp: 3, x: 1, facebook: 1, sms: 1 },
      topSharers: [
        { phone: 'Phoenix user · ••1234', claims: 4 },
        { phone: maskPhone(k1.phone), claims: 3 },
        { phone: maskPhone(k2.phone), claims: 1 },
      ],
      openRate: 0.5,
      costPerClaimCents: 1857 / 2,
      viral: 2,
      friendClaimRate: 0.8,
    })
    expect(maskPhone(k1.phone)).toBe('+234 80• ••• 4567')
    expect(days).toHaveLength(14)
  })

  it('buckets impressions by the Lagos day: 23:30 UTC is already tomorrow, 22:30 UTC is not', async () => {
    const { a } = await world()
    const { days } = await campaignMetrics(a.id, NOW)
    expect(days[13]).toBe(3 + 4)
    expect(days[12]).toBe(2)
    // The October impression is older than the fortnight.
    expect(days.reduce((s, n) => s + n, 0)).toBe(9)
  })

  it('reads zero, never NaN, for a campaign with no rows', async () => {
    const ws = await db.workspace.create({ data: { name: 'W', type: 'Brand', country: 'NG' } })
    const c = await mkCampaign(ws.id, 'Quiet', 'review')
    expect(await campaignMetrics(c.id, NOW)).toEqual({
      imp: 0, opens: 0, claims: 0, shares: 0, sOpens: 0, sClaims: 0, spendCents: 0, rewardCents: 0,
      days: Array(14).fill(0),
      channels: { whatsapp: 0, x: 0, facebook: 0, sms: 0 },
      topSharers: [],
      openRate: 0, costPerClaimCents: null, viral: 0, friendClaimRate: 0,
    })
  })

  it('lists five sharers at most, most payouts first', async () => {
    const { a, phoenix } = await world()
    for (let i = 0; i < 4; i++) {
      const l = await link(a, phoenix.id, 1, 'Channel', { sharerSessionId: `extra-000${i}`, via: 'sms' })
      await payouts(a, l.id, ['sent', 'sent'], { sharerSessionId: `extra-000${i}` })
    }
    const { topSharers } = await campaignMetrics(a.id, NOW)
    expect(topSharers.map((s) => s.claims)).toEqual([4, 3, 2, 2, 2])
  })
})

describe('workspaceSharing', () => {
  it('totals every campaign of the workspace, any status, and splits the shares by medium', async () => {
    const { kola, a, b, c } = await world()
    const s = await workspaceSharing(kola.id)
    expect(s).toMatchObject({ shares: 10, sOpens: 10, sClaims: 9, rewardCents: 32, opens: 5, campaigns: 3 })
    expect(s.byCampaign).toEqual([
      { id: a.id, name: 'Buy 2 get 1', brand: 'Kola Bright', country: 'NG', shares: 7, sOpens: 10, sClaims: 8, viral: 2, rewardCents: 24 },
      { id: b.id, name: 'Pesa promo', brand: 'Kola Bright', country: 'KE', shares: 3, sOpens: 0, sClaims: 1, viral: 0, rewardCents: 8 },
      { id: c.id, name: 'August multipack', brand: 'Kola Bright', country: 'NG', shares: 0, sOpens: 0, sClaims: 0, viral: 0, rewardCents: 0 },
    ])
    // Copy and other are left out of the split; ties keep WhatsApp, Facebook, X, SMS order.
    expect(s.channels.map(({ label, count }) => [label, count])).toEqual([['Facebook', 4], ['WhatsApp', 3], ['X', 1], ['SMS', 1]])
    const pcts = s.channels.map((r) => r.pct)
    ;[(4 / 9) * 100, (3 / 9) * 100, (1 / 9) * 100, (1 / 9) * 100].forEach((p, i) => expect(pcts[i]).toBeCloseTo(p))
  })

  it('is all zeros for a workspace with no campaigns', async () => {
    const ws = await db.workspace.create({ data: { name: 'SunFresh', type: 'Brand', country: 'GH' } })
    const s = await workspaceSharing(ws.id)
    expect(s).toMatchObject({ shares: 0, sOpens: 0, sClaims: 0, rewardCents: 0, opens: 0, campaigns: 0, byCampaign: [] })
    expect(s.channels.map((r) => [r.label, r.count, r.pct])).toEqual([['WhatsApp', 0, 0], ['Facebook', 0, 0], ['X', 0, 0], ['SMS', 0, 0]])
  })

  it('counts points issued on the workspace campaigns only', async () => {
    const { kola, media } = await world()
    expect(await pointsIssued(kola.id)).toBe(90)
    expect(await pointsIssued(media.id)).toBe(20)
  })
})

describe('heroCampaign', () => {
  it('prefers live over paused over review over scheduled, newest submission first', async () => {
    const ws = await db.workspace.create({ data: { name: 'H', type: 'Brand', country: 'NG' } })
    const hero = async () => (await heroCampaign(ws.id, NOW))?.id ?? null
    expect(await hero()).toBeNull()
    await mkCampaign(ws.id, 'draft', 'draft')
    await mkCampaign(ws.id, 'ended', 'ended', { submittedAt: at('2026-11-12T00:00:00Z') })
    await mkCampaign(ws.id, 'rejected', 'rejected', { submittedAt: at('2026-11-12T00:00:00Z') })
    expect(await hero()).toBeNull()
    const scheduled = await mkCampaign(ws.id, 'scheduled', 'scheduled', { submittedAt: at('2026-11-01T00:00:00Z') })
    expect(await hero()).toBe(scheduled.id)
    const review = await mkCampaign(ws.id, 'review', 'review', { submittedAt: at('2026-11-02T00:00:00Z') })
    expect(await hero()).toBe(review.id)
    const paused = await mkCampaign(ws.id, 'paused', 'paused', { submittedAt: at('2026-11-03T00:00:00Z') })
    expect(await hero()).toBe(paused.id)
    const live = await mkCampaign(ws.id, 'old live', 'live', { submittedAt: at('2026-10-01T00:00:00Z') })
    expect(await hero()).toBe(live.id)
    const newer = await mkCampaign(ws.id, 'new live', 'live', { submittedAt: at('2026-11-05T00:00:00Z') })
    expect(await hero()).toBe(newer.id)
  })
})

describe('homeCards', () => {
  it('counts every pill, takes the hero out of All and words each card by status', async () => {
    const { kola, a, b, c } = await world()
    const review = await mkCampaign(kola.id, 'Weekend', 'review', { submittedAt: at('2026-11-13T09:00:00Z') })
    const scheduled = await mkCampaign(kola.id, 'Draw', 'scheduled', {
      startsAt: at('2026-11-15T23:00:00Z'), endsAt: at('2026-11-29T23:00:00Z'), submittedAt: at('2026-11-12T09:00:00Z'),
    })
    const rejected = await mkCampaign(kola.id, 'Jackpot', 'rejected', {
      rejectReasonCode: 'misleading_terms', rejectReason: 'Say where the offer can be redeemed.', submittedAt: at('2026-11-11T09:00:00Z'),
    })
    const all = await homeCards(kola.id, 'all', NOW)
    expect(all.counts).toEqual({ all: 6, live: 1, review: 1, paused: 1, ended: 1, scheduled: 1, rejected: 1 })
    expect(all.hero?.id).toBe(a.id)
    expect(all.cards.map((x) => x.id)).toEqual([review.id, scheduled.id, rejected.id, b.id, c.id])
    const card = (id: string) => all.cards.find((x) => x.id === id)!
    expect(card(review.id)).toMatchObject({ status: 'review', mainLeft: 'Awaiting approval' })
    // Starts on the 16th in Lagos, though it is still the 15th in UTC.
    expect(card(scheduled.id)).toMatchObject({ status: 'scheduled', mainLeft: 'Starts 16 Nov' })
    expect(card(rejected.id)).toMatchObject({
      status: 'rejected', mainLeft: 'Not approved', mainRight: 'Misleading or unclear terms: Say where the offer can be redeemed.',
    })
    expect(card(b.id)).toMatchObject({ status: 'paused', daysLeft: 17, mainLeft: '0 impressions', mainRight: '0% open rate' })
    expect(card(b.id).spendPct).toBeCloseTo(((101 + 8) / 10_000) * 100)
    expect(card(c.id)).toMatchObject({ status: 'ended', spendPct: 0, mainLeft: '0 impressions' })
    expect(card(c.id).daysLeft).toBeUndefined()
    for (const id of [review.id, scheduled.id, rejected.id]) {
      expect(card(id).spendPct).toBeUndefined()
      expect(card(id).daysLeft).toBeUndefined()
    }

    const live = await homeCards(kola.id, 'live', NOW)
    expect(live.hero).toBeNull()
    expect(live.cards).toHaveLength(1)
    expect(live.cards[0]).toMatchObject({
      id: a.id, headline: 'Buy 2 bottles, get 1 free', brand: 'Kola Bright', country: 'Nigeria', status: 'live',
      placement: 'featured', ageGated: false, imageUrl: null, color: '#0F766E', initials: 'KB', daysLeft: 7,
      mainLeft: '10 impressions', mainRight: '50.0% open rate',
    })
    expect(live.cards[0].spendPct).toBeCloseTo((1857 / 30_000) * 100)
    expect((await homeCards(kola.id, 'scheduled', NOW)).cards.map((x) => x.id)).toEqual([scheduled.id])
  })
})

describe('platform', () => {
  it('platformKpis: campaign counts, all-time impressions, this market month of money, Phoenix owed gross × share', async () => {
    await world()
    const k = await platformKpis(NOW)
    // Delivery in each workspace's own market month: Kola (Lagos) 333 + 1200 + 101, MediaSpec (Nairobi) 155.
    expect(k).toEqual({
      live: 2, inReview: 1, impressions: 12, openRate: 0.5,
      grossCents: 1789, rewardCents: 24 + 10 + 6, owedCents: 1073, keptCents: 716, share: 0.6,
    })
    expect(k.owedCents).toBe(Math.round(k.grossCents * k.share))
    expect(k.keptCents).toBe(k.grossCents - k.owedCents)
  })

  it('settlementByMarket: impressions and delivery of each market month, at the share in force when it ends', async () => {
    const { phoenix } = await world()
    const rows = await settlementByMarket(phoenix.id, NOW)
    expect(rows).toEqual([
      { country: 'NG', impressions: 9, deliveryCents: 1533, shareCents: Math.round(1533 * 0.7) },
      { country: 'KE', impressions: 2, deliveryCents: 256, shareCents: Math.round(256 * 0.7) },
      { country: 'GH', impressions: 0, deliveryCents: 0, shareCents: 0 },
      { country: 'TZ', impressions: 0, deliveryCents: 0, shareCents: 0 },
      { country: 'SN', impressions: 0, deliveryCents: 0, shareCents: 0 },
    ])
    const october = await settlementByMarket(phoenix.id, at('2026-10-15T12:00:00Z'))
    expect(october[0]).toEqual({ country: 'NG', impressions: 1, deliveryCents: 300, shareCents: Math.round(300 * 0.55) })
    expect(october[1]).toEqual({ country: 'KE', impressions: 0, deliveryCents: 50, shareCents: Math.round(50 * 0.55) })
  })

  it('rewardsLedgerRows: campaigns with successful shares, owed from payouts, paid once every reward line is', async () => {
    const { a, b, d, media, phoenix } = await world()
    const blockedOnly = await mkCampaign(media.id, 'Blocked only', 'ended', { country: 'KE', submittedAt: at('2026-11-13T00:00:00Z') })
    const bl = await link(blockedOnly, phoenix.id, 1, 'Channel', { sharerSessionId: 'x1', via: 'sms' })
    await payouts(blockedOnly, bl.id, ['blocked', 'rejected'])
    const heldOnly = await mkCampaign(media.id, 'Held only', 'live', { country: 'SN', rewardLocal: 100, submittedAt: at('2026-11-12T00:00:00Z') })
    const hl = await link(heldOnly, phoenix.id, 1, 'Channel', { sharerSessionId: 'x2', via: 'sms' })
    await payouts(heldOnly, hl.id, ['held'], { amountCents: 16 })

    expect(await rewardsLedgerRows()).toEqual([
      // Held and not yet charged: nothing is on an invoice, so it is open.
      { campaignId: heldOnly.id, name: 'Held only', workspaceName: 'MediaSpec', successfulShares: 1, rewardLocal: 100, symbol: 'F', owedCents: 16, rechargeStatus: 'open' },
      { campaignId: a.id, name: 'Buy 2 get 1', workspaceName: 'Kola Bright', successfulShares: 8, rewardLocal: 50, symbol: '₦', owedCents: 24, rechargeStatus: 'open' },
      // One reward line paid, one still due.
      { campaignId: d.id, name: 'Supa10 Jackpot', workspaceName: 'MediaSpec', successfulShares: 2, rewardLocal: 10, symbol: 'KSh', owedCents: 16, rechargeStatus: 'open' },
      { campaignId: b.id, name: 'Pesa promo', workspaceName: 'Kola Bright', successfulShares: 1, rewardLocal: 10, symbol: 'KSh', owedCents: 8, rechargeStatus: 'paid' },
    ])
  })
})

describe('slice-1 exports kept for the old pages', () => {
  it('homeNumbers reads the new metrics', async () => {
    const { a } = await world()
    expect(await homeNumbers(a.id, NOW)).toEqual({
      impressions: 10, impressionsToday: 7, uniqueLinkOpens: 10, shares: 7, claims: 2 + 8, daysElapsed: 7, daysTotal: 14,
    })
  })

  const NOW1 = new Date('2026-12-03T12:00:00Z')

  async function slice1Fixture() {
    const ws = await db.workspace.create({ data: { name: 'Acme', type: 'Brand', country: 'NG' } })
    const campaign = await mkCampaign(ws.id, 'live', 'live', { startsAt: at('2026-12-01'), endsAt: at('2026-12-08') })
    const channel = await db.channel.create({ data: { key: 'phoenix', name: 'Phoenix', apiKeyHash: 'h', isLive: true } })
    const root = await link(campaign, channel.id, 0, 'Root')
    const wa = await link(campaign, channel.id, 1, 'Channel', { parentId: root.id, via: 'whatsapp' })
    await link(campaign, channel.id, 1, 'Channel', { parentId: root.id, via: 'sms' })
    const consumer = await db.consumer.create({ data: { phone: '+2348031234567', country: 'NG' } })
    const friend = await link(campaign, channel.id, 2, 'Consumer', { parentId: wa.id, consumerId: consumer.id })
    await events(campaign, channel.id, 'Impression', 10, NOW1.toISOString())
    await events(campaign, channel.id, 'Open', 3, NOW1.toISOString())
    await events(campaign, channel.id, 'Claim', 1, NOW1.toISOString())
    const le = (linkId: string, type: 'Open' | 'Claim' | 'DetailsLeft', deduped = false) =>
      ({ linkId, type, visitorId: 'v1', ipHash: 'i', userAgent: 'u', deduped, at: NOW1 })
    await db.linkEvent.createMany({
      data: [le(wa.id, 'Open'), le(wa.id, 'Open', true), le(friend.id, 'Claim'), le(friend.id, 'DetailsLeft')],
    })
    return { ws, campaign, channel }
  }

  it('builds the funnel from channel facts and OshoFree facts, kept apart', async () => {
    const { campaign } = await slice1Fixture()
    expect(await campaignFunnel(campaign.id)).toEqual([
      { channel: 'phoenix', saw: 10, openedOnChannel: 3, claimedOnChannel: 1, claimedViaLink: 1, shares: 3, friendOpened: 1, friendClaimed: 1, detailsLeft: 1 },
    ])
  })

  it('reports sharing by channel and by medium', async () => {
    const { campaign } = await slice1Fixture()
    const s = await campaignSharing(campaign.id)
    expect(s).toMatchObject({ shares: 3, friendOpens: 1, friendClaims: 1, detailsLeft: 1, deepestChain: 2 })
    expect(s.byMedium.map((m) => m.via).sort()).toEqual(['sms', 'unknown', 'whatsapp'])
  })

  it('zero-fills the daily series in the market timezone', async () => {
    const { campaign, channel } = await slice1Fixture()
    const d = await campaignDaily(campaign.id, 14, NOW1)
    expect(d).toHaveLength(14)
    expect(d[13]).toMatchObject({ day: '2026-12-03', impressions: 10, linkOpens: 1, claimsOnChannel: 1, claimsViaLink: 1 })
    await events(campaign, channel.id, 'Impression', 1, '2026-12-03T23:30:00Z')
    const late = await campaignDaily(campaign.id, 14, new Date('2026-12-04T00:45:00Z'))
    expect(late[13]).toMatchObject({ day: '2026-12-04', impressions: 1 })
  })
})
