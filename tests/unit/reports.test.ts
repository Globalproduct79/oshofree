import { describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import {
  campaignDaily,
  campaignFunnel,
  campaignSharing,
  heroCampaign,
  homeNumbers,
  workspaceCampaignShares,
  workspaceSharing,
} from '@/lib/reports'

const NOW = new Date('2026-12-03T12:00:00Z')

async function fixture() {
  const ws = await db.workspace.create({ data: { name: 'Acme', type: 'Brand', country: 'NG' } })
  const campaign = await mkCampaign(ws.id, 'live', '2026-12-01', '2026-12-08')
  const channel = await db.channel.create({ data: { key: 'phoenix', name: 'Phoenix', apiKeyHash: 'h', isLive: true } })
  const link = (code: string, depth: number, sharerType: 'Root' | 'Channel' | 'Consumer', parentId?: string, via?: 'whatsapp' | 'sms') =>
    db.shareLink.create({ data: { code, campaignId: campaign.id, channelId: channel.id, depth, sharerType, parentId, via } })
  const root = await link('ROOT0001', 0, 'Root')
  const wa = await link('WHATSAPP', 1, 'Channel', root.id, 'whatsapp')
  await link('SMSLINK1', 1, 'Channel', root.id, 'sms')
  const consumer = await db.consumer.create({ data: { phone: '+2348031234567', country: 'NG' } })
  const friend = await db.shareLink.create({
    data: { code: 'FRIEND01', campaignId: campaign.id, channelId: channel.id, depth: 2, sharerType: 'Consumer', parentId: wa.id, consumerId: consumer.id },
  })
  const at = NOW
  const ev = (type: 'Impression' | 'Open' | 'Claim', i: number) =>
    ({ channelId: channel.id, campaignId: campaign.id, type, sessionId: `s${i}`, at, dedupeKey: `${type}${i}` })
  await db.channelEvent.createMany({
    data: [
      ...Array.from({ length: 10 }, (_, i) => ev('Impression', i)),
      ...Array.from({ length: 3 }, (_, i) => ev('Open', i)),
      ev('Claim', 0),
    ],
  })
  const le = (linkId: string, type: 'Open' | 'Claim' | 'DetailsLeft', deduped = false) =>
    ({ linkId, type, visitorId: 'v1', ipHash: 'i', userAgent: 'u', deduped, at })
  await db.linkEvent.createMany({
    data: [le(wa.id, 'Open'), le(wa.id, 'Open', true), le(friend.id, 'Claim'), le(friend.id, 'DetailsLeft')],
  })
  return { ws, campaign, channel }
}

function mkCampaign(workspaceId: string, status: 'live' | 'paused' | 'review' | 'ended', startsAt: string, endsAt: string) {
  return db.campaign.create({
    data: {
      workspaceId, name: status, brand: 'B', country: 'NG', category: 'Retail', headline: 'H',
      description: 'D', placement: 'card', redeemMethod: 'code', claimCode: 'X1', budgetUsd: 10,
      startsAt: new Date(startsAt), endsAt: new Date(endsAt), shareRewardLabel: 'R', status,
    },
  })
}

describe('reports', () => {
  it('builds the funnel from channel facts and OshoFree facts, kept apart', async () => {
    const { campaign } = await fixture()
    expect(await campaignFunnel(campaign.id)).toEqual([
      { channel: 'phoenix', saw: 10, openedOnChannel: 3, claimedOnChannel: 1, claimedViaLink: 1, shares: 3, friendOpened: 1, friendClaimed: 1, detailsLeft: 1 },
    ])
  })

  it('reports sharing by channel and by medium', async () => {
    const { campaign, ws } = await fixture()
    const s = await campaignSharing(campaign.id)
    expect(s).toMatchObject({ shares: 3, friendOpens: 1, friendClaims: 1, detailsLeft: 1, deepestChain: 2 })
    expect(s.viralCoefficient).toBeCloseTo(1 / 3)
    expect(s.byChannel).toEqual([{ channel: 'phoenix', shares: 3, friendOpens: 1, friendClaims: 1 }])
    const medium = (v: string) => s.byMedium.find((m) => m.via === v)
    expect(medium('whatsapp')).toEqual({ via: 'whatsapp', shares: 1, friendOpens: 1, friendClaims: 0 })
    expect(medium('sms')).toEqual({ via: 'sms', shares: 1, friendOpens: 0, friendClaims: 0 })
    expect(medium('unknown')).toEqual({ via: 'unknown', shares: 1, friendOpens: 0, friendClaims: 1 })
    expect(await workspaceSharing(ws.id)).toEqual(s)
  })

  it('has a null viral coefficient and depth 0 when nothing was shared', async () => {
    const ws = await db.workspace.create({ data: { name: 'W', type: 'Brand', country: 'NG' } })
    const c = await mkCampaign(ws.id, 'live', '2026-12-01', '2026-12-08')
    const s = await campaignSharing(c.id)
    expect(s).toMatchObject({ shares: 0, deepestChain: 0, viralCoefficient: null, byChannel: [], byMedium: [] })
  })

  it('zero-fills the daily series in the market timezone', async () => {
    const { campaign } = await fixture()
    const d = await campaignDaily(campaign.id, 14, NOW)
    const today = '2026-12-03'
    expect(d).toHaveLength(14)
    expect(d[13].day).toBe(today)
    expect(d.reduce((n, p) => n + p.impressions, 0)).toBe(10)
    expect(d[13]).toMatchObject({ impressions: 10, linkOpens: 1, claimsOnChannel: 1, claimsViaLink: 1 })
    expect(d[0]).toMatchObject({ impressions: 0, linkOpens: 0, claimsOnChannel: 0, claimsViaLink: 0 })
  })

  it('buckets naive-UTC timestamps by the market day, not the UTC day', async () => {
    const { campaign, channel } = await fixture()
    await db.channelEvent.deleteMany({ where: { campaignId: campaign.id } })
    await db.channelEvent.create({
      data: { channelId: channel.id, campaignId: campaign.id, type: 'Impression', sessionId: 's', at: new Date('2026-12-03T23:30:00Z'), dedupeKey: 'late' },
    })
    const now = new Date('2026-12-04T00:45:00Z')
    const d = await campaignDaily(campaign.id, 14, now)
    expect(d[13]).toMatchObject({ day: '2026-12-04', impressions: 1 })
    expect(d[12]).toMatchObject({ day: '2026-12-03', impressions: 0 })
    expect((await homeNumbers(campaign.id, now)).impressionsToday).toBe(1)
  })

  it('computes the Home numbers', async () => {
    const { campaign } = await fixture()
    const h = await homeNumbers(campaign.id, NOW)
    expect(h).toMatchObject({ impressions: 10, impressionsToday: 10, uniqueLinkOpens: 1, shares: 3, claims: 2, daysTotal: 7 })
    const early = await homeNumbers(campaign.id, new Date('2026-11-01'))
    const late = await homeNumbers(campaign.id, new Date('2027-01-01'))
    expect([early.daysElapsed, late.daysElapsed]).toEqual([0, 7])
    expect((await homeNumbers(campaign.id, NOW)).daysElapsed).toBe(2)
  })

  it('picks the hero campaign: live over paused over review, newest first', async () => {
    const ws = await db.workspace.create({ data: { name: 'W', type: 'Brand', country: 'NG' } })
    expect(await heroCampaign(ws.id, NOW)).toBeNull()
    const review = await mkCampaign(ws.id, 'review', '2026-12-02', '2026-12-09')
    expect((await heroCampaign(ws.id, NOW))?.id).toBe(review.id)
    const paused = await mkCampaign(ws.id, 'paused', '2026-12-01', '2026-12-09')
    expect((await heroCampaign(ws.id, NOW))?.id).toBe(paused.id)
    await mkCampaign(ws.id, 'ended', '2026-11-01', '2026-11-20')
    expect((await heroCampaign(ws.id, NOW))?.id).toBe(paused.id)
    await mkCampaign(ws.id, 'live', '2026-12-01', '2026-12-09')
    const newer = await mkCampaign(ws.id, 'live', '2026-12-02', '2026-12-09')
    expect((await heroCampaign(ws.id, NOW))?.id).toBe(newer.id)
  })

  it('counts shares and friend claims per campaign in one pass, only for this workspace', async () => {
    const { ws, campaign } = await fixture()
    const other = await mkCampaign(ws.id, 'paused', '2026-12-01', '2026-12-08')
    const outsider = await db.workspace.create({ data: { name: 'Else', type: 'Brand', country: 'NG' } })
    await mkCampaign(outsider.id, 'live', '2026-12-01', '2026-12-08')
    const channel = await db.channel.findFirstOrThrow({ where: { key: 'phoenix' } })
    await db.shareLink.create({ data: { code: 'OTHER001', campaignId: other.id, channelId: channel.id, depth: 1, sharerType: 'Channel', via: 'x' } })
    const rows = await workspaceCampaignShares(ws.id)
    expect(rows).toHaveLength(2)
    expect(rows).toContainEqual({ campaignId: campaign.id, shares: 3, friendClaims: 1 })
    expect(rows).toContainEqual({ campaignId: other.id, shares: 1, friendClaims: 0 })
  })
})
