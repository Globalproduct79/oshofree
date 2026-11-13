import { describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import {
  linkByCode,
  linkUrl,
  mintChannelLink,
  mintConsumerLink,
  setLinkVia,
} from '@/lib/links'
import { linkStats, recordClaim, recordDetails, recordOpen, startOfUtcDay } from '@/lib/link-events'
import { upsertConsumer } from '@/lib/consumers'

async function setup() {
  const ws = await db.workspace.create({ data: { name: 'Acme', type: 'Brand', country: 'NG' } })
  const campaign = await db.campaign.create({
    data: {
      workspaceId: ws.id, name: 'C', brand: 'B', country: 'NG', category: 'Retail', headline: 'H',
      description: 'D', placement: 'card', redeemMethod: 'code', claimCode: 'X1', budgetUsd: 10,
      startsAt: new Date('2026-12-01'), endsAt: new Date('2026-12-08'), shareRewardLabel: 'R',
    },
  })
  const channel = await db.channel.create({ data: { key: 'phoenix', name: 'Phoenix', apiKeyHash: 'h', isLive: true } })
  return { campaign, channel }
}

describe('startOfUtcDay', () => {
  it('splits the days at 00:00 UTC', () => {
    expect(startOfUtcDay(new Date('2026-11-13T23:59:59Z')).toISOString()).toBe('2026-11-13T00:00:00.000Z')
    expect(startOfUtcDay(new Date('2026-11-14T00:00:00Z')).toISOString()).toBe('2026-11-14T00:00:00.000Z')
  })
})

describe('share-link tree', () => {
  it('increments depth from Root to Channel to Consumers', async () => {
    const { campaign, channel } = await setup()
    const ch = await mintChannelLink(campaign.id, channel.id, 'sess-1', 'whatsapp')
    expect(ch).toMatchObject({ depth: 1, sharerType: 'Channel', sharerSessionId: 'sess-1', via: 'whatsapp' })
    const root = await db.shareLink.findFirstOrThrow({ where: { sharerType: 'Root', campaignId: campaign.id } })
    expect(ch.parentId).toBe(root.id)
    const consumer = await upsertConsumer('+2348031234567', 'NG')
    const c2 = await mintConsumerLink(ch.id, consumer.id)
    const c3 = await mintConsumerLink(c2.id, consumer.id)
    expect([root.depth, ch.depth, c2.depth, c3.depth]).toEqual([0, 1, 2, 3])
    expect(c2).toMatchObject({ sharerType: 'Consumer', via: null, campaignId: campaign.id, channelId: channel.id })
  })

  it('sets via, finds by code and builds the url', async () => {
    const { campaign, channel } = await setup()
    const ch = await mintChannelLink(campaign.id, channel.id, 's', 'copy')
    await setLinkVia(ch.id, 'sms')
    const found = await linkByCode(ch.code)
    expect(found?.via).toBe('sms')
    expect(found?.campaign.workspace.id).toBe(campaign.workspaceId)
    expect(await linkByCode('NOPE0000')).toBeNull()
    expect(linkUrl(ch.code)).toBe(`${process.env.APP_URL}/o/${ch.code}`)
  })
})

describe('events', () => {
  it('dedupes opens per visitor per UTC day and counts stats', async () => {
    const { campaign, channel } = await setup()
    const link = await mintChannelLink(campaign.id, channel.id, 's', 'x')
    const day1 = new Date('2026-11-13T10:00:00Z')
    expect(await recordOpen(link.id, 'v1', 'h', 'ua', day1)).toEqual({ deduped: false })
    expect(await recordOpen(link.id, 'v1', 'h', 'ua', new Date('2026-11-13T23:59:59Z'))).toEqual({ deduped: true })
    expect(await recordOpen(link.id, 'v1', 'h', 'ua', new Date('2026-11-14T00:00:00Z'))).toEqual({ deduped: false })
    expect(await recordOpen(link.id, 'v2', 'h', 'ua', day1)).toEqual({ deduped: false })
    await recordClaim(link.id, 'v1', 'h', 'ua')
    await recordDetails(link.id, 'v1', 'h', 'ua')
    const consumer = await upsertConsumer('+2348031234567', 'NG')
    await mintConsumerLink(link.id, consumer.id)
    await mintConsumerLink(link.id, consumer.id)
    expect(await linkStats(link.code)).toEqual({
      opens_unique: 3, opens_all: 4, details_left: 1, claims: 1, children: 2,
    })
    expect(await linkStats('NOPE0000')).toBeNull()
  })

  it('counts exactly one unique open when the same visitor opens concurrently', async () => {
    const { campaign, channel } = await setup()
    const link = await mintChannelLink(campaign.id, channel.id, 's', 'x')
    const now = new Date('2026-11-13T10:00:00Z')
    await Promise.all(Array.from({ length: 10 }, () => recordOpen(link.id, 'v1', 'h', 'ua', now)))
    expect(await db.linkEvent.count({ where: { linkId: link.id, deduped: false } })).toBe(1)
    expect(await db.linkEvent.count({ where: { linkId: link.id } })).toBe(10)
  })

  it('does not let a later-day row dedupe an earlier-day open', async () => {
    const { campaign, channel } = await setup()
    const link = await mintChannelLink(campaign.id, channel.id, 's', 'x')
    await recordOpen(link.id, 'v1', 'h', 'ua', new Date('2026-11-14T09:00:00Z'))
    expect(await recordOpen(link.id, 'v1', 'h', 'ua', new Date('2026-11-13T09:00:00Z'))).toEqual({ deduped: false })
  })
})
