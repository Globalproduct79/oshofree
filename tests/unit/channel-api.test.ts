import type { Prisma, WorkspaceStatus } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { GET as getOffers } from '@/app/api/v1/offers/route'
import { POST as postShare } from '@/app/api/v1/share/route'
import { POST as postEvents } from '@/app/api/v1/events/route'
import { GET as getStats } from '@/app/api/v1/links/[code]/stats/route'
import { hashKey } from '@/lib/channels'
import { db } from '@/lib/db'
import { type EventInput, ingestEvents } from '@/lib/events'
import { recordOpen } from '@/lib/link-events'
import { linkUrl, mintChannelLink, mintRootLink } from '@/lib/links'

const KEY = 'phx_test_key'
const DAY = 86_400_000
const auth = { authorization: `Bearer ${KEY}` }
type Handler = (req: Request) => Promise<Response>

const seedChannel = (key = 'phoenix', apiKey = KEY) =>
  db.channel.create({ data: { key, name: key, apiKeyHash: hashKey(apiKey), isLive: true } })

async function seedCampaign(over: Partial<Prisma.CampaignUncheckedCreateInput> = {}, ws: WorkspaceStatus = 'approved') {
  const workspace = await db.workspace.create({ data: { name: 'Kola Bright', type: 'Brand', country: 'NG', status: ws } })
  return db.campaign.create({
    data: {
      workspaceId: workspace.id, name: 'Buy 2 get 1', brand: 'Kola Bright', country: 'NG', category: 'Food & drink',
      headline: 'Buy 2 Kola Bright, get 1 free', description: 'At any Kola Bright stockist.', placement: 'card',
      redeemMethod: 'code', claimCode: 'KOLA2X1', budgetUsd: 100, status: 'live', shareRewardLabel: '₦50 airtime',
      startsAt: new Date(Date.now() - DAY), endsAt: new Date(Date.now() + 7 * DAY), ...over,
    },
  })
}

const offers = (query = 'country=NG', headers: Record<string, string> = auth) =>
  getOffers(new Request(`http://localhost/api/v1/offers?${query}`, { headers }))
const post = (handler: Handler, path: string, body: unknown, headers: Record<string, string> = {}) =>
  handler(new Request(`http://localhost/api/v1/${path}`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }))
const share = (body: unknown, headers?: Record<string, string>) => post(postShare, 'share', body, headers)
const events = (body: unknown, key: string | null = 'batch-1', headers: Record<string, string> = {}) =>
  post(postEvents, 'events', body, key === null ? headers : { 'idempotency-key': key, ...headers })
const stats = (code: string, headers: Record<string, string> = auth) =>
  getStats(new Request(`http://localhost/api/v1/links/${code}/stats`, { headers }), { params: Promise.resolve({ code }) })
const ev = (offer_id: string, over: Record<string, unknown> = {}) =>
  ({ type: 'impression', offer_id, session_id: 's1', ts: '2026-11-13T10:05:00Z', ...over }) as EventInput
const expectError = async (res: Response, status: number, error: string) => {
  expect(res.status).toBe(status)
  expect(res.headers.get('cache-control')).toBe('no-store')
  expect(await res.json()).toEqual({ error })
}

describe('channel key', () => {
  it('hashes keys as sha256 hex', () => {
    expect(hashKey('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('answers 401 on every route without a bearer key or with an unknown one', async () => {
    await seedChannel()
    const none = { authorization: '' }
    await expectError(await offers('country=NG', {}), 401, 'unauthorized')
    await expectError(await offers('country=NG', { authorization: 'Bearer nope' }), 401, 'unauthorized')
    await expectError(await offers('country=NG', { authorization: KEY }), 401, 'unauthorized')
    await expectError(await share({}, none), 401, 'unauthorized')
    await expectError(await events({}, 'k', none), 401, 'unauthorized')
    await expectError(await stats('ABCDEFGH', {}), 401, 'unauthorized')
  })
})

describe('GET /api/v1/offers', () => {
  it('answers 400 for a country outside the five markets', async () => {
    await seedChannel()
    for (const q of ['country=US', 'country=ng', 'country=', ''])
      await expectError(await offers(q), 400, 'bad_country')
  })

  it('lists only campaigns delivering now in that country, earliest start first', async () => {
    await seedChannel()
    const later = await seedCampaign({ startsAt: new Date(Date.now() - DAY / 2) })
    const live = await seedCampaign()
    await seedCampaign({ country: 'KE' })
    await seedCampaign({ startsAt: new Date(Date.now() - 8 * DAY), endsAt: new Date(Date.now() - DAY) })
    await seedCampaign({}, 'pending')
    await seedCampaign({ status: 'paused' })
    const res = await offers()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8')
    const body = await res.json()
    expect(body).toMatchObject({ country: 'NG', ttl_seconds: 900 })
    expect(new Date(body.generated_at).toISOString()).toBe(body.generated_at)
    expect(body.offers.map((o: { id: string }) => o.id)).toEqual([live.id, later.id])
  })

  it('gives a code offer its code as the label and no url, and mints nothing', async () => {
    await seedChannel()
    const c = await seedCampaign({ creativeImageKey: 'card.png', tileColor: 'sunrise' })
    const { offers: [offer] } = await (await offers()).json()
    expect(offer).toEqual({
      id: c.id, placement: 'card', brand: 'Kola Bright', headline: 'Buy 2 Kola Bright, get 1 free',
      description: 'At any Kola Bright stockist.', category: 'Food & drink',
      creative: { image: `${process.env.APP_URL}/uploads/card.png`, color: 'sunrise' },
      cta: { label: 'KOLA2X1', type: 'code', url: null },
      share: { enabled: true, reward_label: '₦50 airtime' },
      ends_at: c.endsAt.toISOString(),
    })
    expect(await db.shareLink.count()).toBe(0)
  })

  it("points a link offer's cta at this channel's Root link with ?go=claim, minting it once", async () => {
    const channel = await seedChannel()
    const other = await seedChannel('boomplay', 'other_key')
    const c = await seedCampaign({ redeemMethod: 'link', claimCode: null, linkUrl: 'https://kola.example/offer' })
    await mintRootLink(c.id, other.id)
    const first = (await (await offers()).json()).offers[0]
    const second = (await (await offers()).json()).offers[0]
    const roots = await db.shareLink.findMany({ where: { campaignId: c.id, channelId: channel.id } })
    expect(roots).toHaveLength(1)
    expect(roots[0]).toMatchObject({ sharerType: 'Root', depth: 0 })
    expect(first.cta).toEqual({ label: 'Open offer', type: 'link', url: `${linkUrl(roots[0].code)}?go=claim` })
    expect(first.cta.url).toMatch(/\?go=claim$/)
    expect(second.cta).toEqual(first.cta)
    expect(first.creative).toEqual({ image: null, color: null })
    expect(first.share).toEqual({ enabled: true, reward_label: '₦50 airtime' })
  })
})

describe('POST /api/v1/share', () => {
  it('mints a depth-1 Channel link under the Root with the sharer session and via', async () => {
    const channel = await seedChannel()
    const c = await seedCampaign()
    const res = await share({ offer_id: c.id, session_id: 'sess-9', via: 'whatsapp' })
    expect(res.status).toBe(201)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const { code, url } = await res.json()
    expect(url).toBe(linkUrl(code))
    const link = await db.shareLink.findUniqueOrThrow({ where: { code }, include: { parent: true } })
    expect(link).toMatchObject({
      depth: 1, sharerType: 'Channel', sharerSessionId: 'sess-9', via: 'whatsapp', campaignId: c.id, channelId: channel.id,
    })
    expect(link.parent).toMatchObject({ sharerType: 'Root', depth: 0, channelId: channel.id })
  })

  it('answers 404 for an unknown offer and 409 for one not delivering', async () => {
    await seedChannel()
    const ended = await seedCampaign({ startsAt: new Date(Date.now() - 8 * DAY), endsAt: new Date(Date.now() - DAY) })
    const pending = await seedCampaign({}, 'pending')
    await expectError(await share({ offer_id: 'nope', session_id: 's', via: 'sms' }), 404, 'unknown_offer')
    await expectError(await share({ offer_id: ended.id, session_id: 's', via: 'sms' }), 409, 'not_delivering')
    await expectError(await share({ offer_id: pending.id, session_id: 's', via: 'sms' }), 409, 'not_delivering')
    expect(await db.shareLink.count()).toBe(0)
  })

  it('answers 400 for a body outside the contract', async () => {
    await seedChannel()
    const c = await seedCampaign()
    await expectError(await share({ offer_id: c.id, session_id: 's', via: 'telegram' }), 400, 'bad_request')
    await expectError(await share({ offer_id: c.id, via: 'sms' }), 400, 'bad_request')
    await expectError(await share('not json'), 400, 'bad_request')
  })
})

describe('POST /api/v1/events', () => {
  it('accepts a batch, maps the types and stores each event', async () => {
    const channel = await seedChannel()
    const c = await seedCampaign()
    const batch = { channel: 'phoenix', events: [
      ev(c.id, { placement: 'card', country: 'NG' }), ev(c.id, { type: 'open', link_code: 'ABCDEFGH' }), ev(c.id, { type: 'claim' }),
    ] }
    const res = await events(batch)
    expect(res.status).toBe(202)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ accepted: 3, deduped: 0, ignored: 0 })
    const rows = await db.channelEvent.findMany({ orderBy: { type: 'asc' } })
    expect(rows.map((r) => [r.type, r.linkCode])).toEqual([['Impression', null], ['Open', 'ABCDEFGH'], ['Claim', null]])
    expect(rows[0]).toMatchObject({ channelId: channel.id, campaignId: c.id, sessionId: 's1', at: new Date('2026-11-13T10:05:00Z') })
  })

  it('replays the same Idempotency-Key with identical counts and inserts nothing', async () => {
    await seedChannel()
    const c = await seedCampaign()
    const batch = { channel: 'phoenix', events: [ev(c.id), ev(c.id, { type: 'open' }), ev(c.id, { type: 'share' })] }
    await events(batch)
    const again = await events(batch)
    expect(again.status).toBe(202)
    expect(await again.json()).toEqual({ accepted: 3, deduped: 0, ignored: 0 })
    expect(await db.channelEvent.count()).toBe(3)
    expect(await db.channelBatch.count()).toBe(1)
  })

  it('rolls back a batch that loses the race for its key and returns the winner\'s counts', async () => {
    const channel = await seedChannel()
    const c = await seedCampaign()
    expect(await ingestEvents(channel.id, 'k', [ev(c.id)])).toEqual({ accepted: 1, deduped: 0, ignored: 0, replayed: false })
    // As if the winner committed between our replay check and our insert.
    const lookup = vi.spyOn(db.channelBatch, 'findUnique').mockResolvedValueOnce(null)
    const fresh = ev(c.id, { type: 'claim', session_id: 's2' })
    const result = await ingestEvents(channel.id, 'k', [fresh])
    const lookups = lookup.mock.calls.length
    lookup.mockRestore()
    expect(result).toEqual({ accepted: 1, deduped: 0, ignored: 0, replayed: true })
    expect(lookups).toBe(2)
    expect(await db.channelEvent.count()).toBe(1)
    expect(await db.channelBatch.count()).toBe(1)
  })

  it('dedupes the same session, offer and type within an hour, and ignores unknown offers', async () => {
    await seedChannel()
    const c = await seedCampaign()
    const same = await events({ channel: 'phoenix', events: [ev(c.id), ev(c.id, { ts: '2026-11-13T10:55:00Z' })] })
    expect(await same.json()).toEqual({ accepted: 1, deduped: 1, ignored: 0 })
    const next = await events({ channel: 'phoenix', events: [ev(c.id, { ts: '2026-11-13T11:00:00Z' }), ev('nope')] }, 'b2')
    expect(await next.json()).toEqual({ accepted: 1, deduped: 0, ignored: 1 })
    expect(await db.channelEvent.count()).toBe(2)
  })

  it('refuses a batch without a key, over 500 events, for another channel, or off contract', async () => {
    await seedChannel()
    const c = await seedCampaign()
    const ok = { channel: 'phoenix', events: [ev(c.id)] }
    await expectError(await events(ok, null), 400, 'missing_idempotency_key')
    await expectError(await events({ channel: 'phoenix', events: Array(501).fill(ev(c.id)) }), 400, 'too_many_events')
    await expectError(await events({ channel: 'boomplay', events: [ev(c.id)] }), 400, 'channel_mismatch')
    await expectError(await events({ channel: 'phoenix', events: [ev(c.id, { type: 'view' })] }), 400, 'bad_request')
    await expectError(await events({ channel: 'phoenix', events: [ev(c.id, { ts: 'yesterday' })] }), 400, 'bad_request')
    await expectError(await events('not json'), 400, 'bad_request')
    expect(await db.channelBatch.count()).toBe(0)
    const full = await events({ channel: 'phoenix', events: Array(500).fill(ev(c.id)) })
    expect(await full.json()).toEqual({ accepted: 1, deduped: 499, ignored: 0 })
  })
})

describe('GET /api/v1/links/{code}/stats', () => {
  it("returns the link's stats, or 404 for an unknown code", async () => {
    const channel = await seedChannel()
    const c = await seedCampaign()
    const link = await mintChannelLink(c.id, channel.id, 's', 'copy')
    await recordOpen(link.id, 'v1', 'h', 'ua')
    const res = await stats(link.code)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ opens_unique: 1, opens_all: 1, details_left: 0, claims: 0, children: 0 })
    await expectError(await stats('NOPE0000'), 404, 'unknown_link')
  })
})
