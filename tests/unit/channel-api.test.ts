import type { Prisma, WorkspaceStatus } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { GET as getOffers } from '@/app/api/v1/offers/route'
import { POST as postShare } from '@/app/api/v1/share/route'
import { POST as postEvents } from '@/app/api/v1/events/route'
import { GET as getStats } from '@/app/api/v1/links/[code]/stats/route'
import { withChannel } from '@/lib/api-responses'
import { channelFromRequest, hashKey, rotateKey } from '@/lib/channels'
import { db } from '@/lib/db'
import { type EventInput, ingestEvents } from '@/lib/events'
import { endCampaign } from '@/lib/campaigns'
import { runDaily } from '@/lib/jobs/daily'
import { recordOpen } from '@/lib/link-events'
import { linkUrl, mintChannelLink, mintRootLink } from '@/lib/links'

const KEY = 'phx_test_key'
const DAY = 86_400_000
const auth = { authorization: `Bearer ${KEY}` }
type Handler = (req: Request) => Promise<Response>

const seedChannel = (key = 'phoenix', apiKey = KEY, isLive = true) =>
  db.channel.create({ data: { key, name: key, apiKeyHash: hashKey(apiKey), isLive } })

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

  it('answers 401 on every route for the key of a channel that is not live', async () => {
    const dark = await seedChannel('boomplay', 'bmp_key', false)
    const c = await seedCampaign()
    const link = await mintChannelLink(c.id, dark.id, 's', 'sms')
    const bmp = { authorization: 'Bearer bmp_key' }
    await expectError(await offers('country=NG', bmp), 401, 'unauthorized')
    await expectError(await share({ offer_id: c.id, session_id: 's', via: 'sms' }, bmp), 401, 'unauthorized')
    await expectError(await events({ channel: 'boomplay', events: [ev(c.id)] }, 'k', bmp), 401, 'unauthorized')
    await expectError(await stats(link.code, bmp), 401, 'unauthorized')
    expect(await db.shareLink.count()).toBe(2)
    expect(await db.channelEvent.count()).toBe(0)
  })

  it('answers 500 server_error, uncached, when a handler throws, and logs it', async () => {
    await seedChannel()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await withChannel(new Request('http://localhost/api/v1/x', { headers: auth }), async () => {
      throw new Error('boom')
    })
    const logged = log.mock.calls.length
    log.mockRestore()
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8')
    await expectError(res, 500, 'server_error')
    expect(logged).toBe(1)
  })
})

describe('GET /api/v1/offers', () => {
  it('answers 400 for a country outside the five markets', async () => {
    await seedChannel()
    for (const q of ['country=US', 'country=ng', 'country=', ''])
      await expectError(await offers(q), 400, 'bad_country')
  })

  it('lists only live campaigns of approved workspaces in that country, by placement then remaining budget', async () => {
    await seedChannel()
    const fuller = await seedCampaign({ budgetUsd: 100 })
    const emptier = await seedCampaign({ budgetUsd: 200 })
    await db.ledgerEntry.create({
      data: { workspaceId: emptier.workspaceId, campaignId: emptier.id, kind: 'delivery', amountCents: -15_000, description: 'delivery' },
    })
    const splash = await seedCampaign({ placement: 'splash' })
    const featured = await seedCampaign({ placement: 'featured' })
    const video = await seedCampaign({ placement: 'video' })
    await seedCampaign({ country: 'KE' })
    await seedCampaign({ status: 'ended', startsAt: new Date(Date.now() - 8 * DAY), endsAt: new Date(Date.now() - DAY) })
    await seedCampaign({ status: 'scheduled', startsAt: new Date(Date.now() + DAY) })
    await seedCampaign({ status: 'review' }, 'pending')
    await seedCampaign({ status: 'paused' })
    // Declined after approval: its campaigns stop delivering even though they are still stored live.
    await seedCampaign({}, 'declined')
    const res = await offers()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8')
    const body = await res.json()
    expect(body).toMatchObject({ country: 'NG', ttl_seconds: 900 })
    expect(new Date(body.generated_at).toISOString()).toBe(body.generated_at)
    expect(body.offers.map((o: { id: string }) => o.id)).toEqual([fuller.id, emptier.id, featured.id, video.id, splash.id])
    expect(body.offers.map((o: { placement: string }) => o.placement)).toEqual(['card', 'card', 'featured', 'video', 'splash'])
  })

  it('stops listing a live campaign once its budget is spent, before the daily job ends it', async () => {
    await seedChannel()
    const charge = (c: { id: string; workspaceId: string }, kind: 'delivery' | 'reward', amountCents: number, key: string) =>
      db.ledgerEntry.create({ data: { workspaceId: c.workspaceId, campaignId: c.id, kind, amountCents, description: kind, dedupeKey: key } })
    const spent = await seedCampaign({ budgetUsd: 100 })
    // Yesterday's delivery, then a friend's claim today charges the last reward: exactly the budget.
    await charge(spent, 'delivery', -9_990, 'd1')
    await charge(spent, 'reward', -10, 'r1')
    const over = await seedCampaign({ budgetUsd: 50 })
    await charge(over, 'delivery', -6_000, 'd2')
    const left = await seedCampaign({ budgetUsd: 100 })
    await charge(left, 'reward', -9_999, 'r2')
    const body = await (await offers()).json()
    expect(body.offers.map((o: { id: string }) => o.id)).toEqual([left.id])
    // Still stored live: the daily job ends it.
    expect(await db.campaign.findUniqueOrThrow({ where: { id: spent.id }, select: { status: true } })).toEqual({ status: 'live' })
  })

  it('builds every URL on the configured base, absolute, whether or not it ends in a slash', async () => {
    await seedChannel()
    vi.stubEnv('APP_URL', 'https://offers.example.com/')
    try {
      await seedCampaign({ placement: 'featured', creativeImageKey: 'card.png' })
      await seedCampaign({ redeemMethod: 'link', claimCode: null, linkUrl: 'https://kola.example/offer' })
      const [link, featured] = (await (await offers()).json()).offers
      expect(featured.creative.image).toBe('https://offers.example.com/uploads/card.png')
      expect(link.cta.url).toMatch(/^https:\/\/offers\.example\.com\/o\/[0-9A-Z]{8}\?go=claim$/)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('answers 500 server_error rather than hand out a link without a host when APP_URL is not set', async () => {
    await seedChannel()
    await seedCampaign({ redeemMethod: 'link', claimCode: null, linkUrl: 'https://kola.example/offer' })
    vi.stubEnv('APP_URL', '')
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expectError(await offers(), 500, 'server_error')
    } finally {
      log.mockRestore()
      vi.unstubAllEnvs()
    }
  })

  it('stops listing a live campaign once its flight has ended, before the daily job ends it', async () => {
    await seedChannel()
    const running = await seedCampaign()
    const over = await seedCampaign({ startsAt: new Date(Date.now() - 8 * DAY), endsAt: new Date(Date.now() - 60_000) })
    const body = await (await offers()).json()
    expect(body.offers.map((o: { id: string }) => o.id)).toEqual([running.id])
    expect(await db.campaign.findUniqueOrThrow({ where: { id: over.id }, select: { status: true } })).toEqual({ status: 'live' })
  })

  it('accepts ?channel= naming the key\'s own channel and refuses another', async () => {
    await seedChannel()
    await seedCampaign()
    expect((await offers('country=NG&channel=phoenix')).status).toBe(200)
    await expectError(await offers('country=NG&channel=boomplay'), 400, 'channel_mismatch')
  })

  it('serves the prototype\'s wire shape: a code offer gets no code and no url, and mints nothing', async () => {
    await seedChannel()
    const c = await seedCampaign({
      placement: 'video', creativeImageKey: 'card.png', creativeVideoKey: 'clip.mp4', tileColor: '#2B5FD9',
      ageGated: true, endsAt: new Date('2030-11-17T23:00:00Z'),
    })
    const { offers: [offer] } = await (await offers()).json()
    expect(offer).toEqual({
      id: c.id, placement: 'video', brand: 'Kola Bright', headline: 'Buy 2 Kola Bright, get 1 free',
      description: 'At any Kola Bright stockist.', category: 'Food & drink',
      creative: { image: `${process.env.APP_URL}/uploads/card.png`, video: `${process.env.APP_URL}/uploads/clip.mp4`, color: '#2B5FD9' },
      cta: { label: 'Get this offer', type: 'code', url: null },
      flags: { sponsored: true, age_18: true },
      share: { enabled: true, reward_label: '₦50 airtime' },
      // The exclusive end instant, written in the market's zone (Lagos is UTC+1).
      ends_at: '2030-11-18T00:00:00+01:00',
    })
    expect(new Date(offer.ends_at)).toEqual(c.endsAt)
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
    expect(first.cta).toEqual({ label: 'Get this offer', type: 'link', url: `${linkUrl(roots[0].code)}?go=claim` })
    expect(first.cta.url).toMatch(/\?go=claim$/)
    expect(second.cta).toEqual(first.cta)
    expect(first.creative).toEqual({ image: null, video: null, color: null })
    expect(first.flags).toEqual({ sponsored: true, age_18: false })
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
    const ended = await seedCampaign({ status: 'ended', startsAt: new Date(Date.now() - 8 * DAY), endsAt: new Date(Date.now() - DAY) })
    const pending = await seedCampaign({ status: 'review' }, 'pending')
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

  it('links the sharer\'s number to a Consumer on the Channel link, and hands the same link back next time', async () => {
    const channel = await seedChannel()
    const c = await seedCampaign()
    const res = await share({ offer_id: c.id, session_id: 'sess-9', via: 'whatsapp', msisdn: '+2348031234567' })
    expect(res.status).toBe(201)
    const { code } = await res.json()
    const consumer = await db.consumer.findUniqueOrThrow({ where: { phone: '+2348031234567' } })
    expect(consumer.country).toBe('NG')
    const link = await db.shareLink.findUniqueOrThrow({ where: { code } })
    expect(link).toMatchObject({ sharerType: 'Channel', consumerId: consumer.id, sharerSessionId: 'sess-9', channelId: channel.id })
    const again = await share({ offer_id: c.id, session_id: 'sess-9', via: 'sms', msisdn: '+234 803 123 4567' })
    expect(again.status).toBe(201)
    expect((await again.json()).code).toBe(code)
    const both = await Promise.all([1, 2].map(() => share({ offer_id: c.id, session_id: 's', via: 'x', msisdn: '+2348031234568' })))
    const codes = await Promise.all(both.map(async (r) => (await r.json()).code))
    expect(codes[0]).toBe(codes[1])
    expect(await db.shareLink.count({ where: { sharerType: 'Channel' } })).toBe(2)
    expect(await db.consumer.count()).toBe(2)
  })

  it('answers 400 bad_request for a number that is not the offer\'s country, saving nothing', async () => {
    await seedChannel()
    const c = await seedCampaign()
    for (const msisdn of ['+447700900123', '+2348031', 'not a number', ''])
      await expectError(await share({ offer_id: c.id, session_id: 's', via: 'sms', msisdn }), 400, 'bad_request')
    expect(await db.shareLink.count()).toBe(0)
    expect(await db.consumer.count()).toBe(0)
  })

  it('answers 409 not_delivering for a live campaign whose budget is spent, as for a paused one', async () => {
    await seedChannel()
    const c = await seedCampaign({ budgetUsd: 100 })
    await db.ledgerEntry.create({ data: { workspaceId: c.workspaceId, campaignId: c.id, kind: 'reward', amountCents: -10_000, description: 'reward' } })
    await expectError(await share({ offer_id: c.id, session_id: 's', via: 'sms' }), 409, 'not_delivering')
    expect(await db.shareLink.count({ where: { sharerType: 'Channel' } })).toBe(0)
  })

  it('answers 409 for a live campaign in a declined workspace', async () => {
    await seedChannel()
    const c = await seedCampaign({}, 'declined')
    await expectError(await share({ offer_id: c.id, session_id: 's', via: 'sms' }), 409, 'not_delivering')
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

  it('ignores events for an offer that never went live, so nothing is stored or billed for it', async () => {
    const channel = await seedChannel()
    const live = await seedCampaign({ cpmCents: 220 })
    const paused = await seedCampaign({ status: 'paused' })
    const ended = await seedCampaign({ status: 'ended' })
    const never = await Promise.all(
      (['draft', 'review', 'scheduled', 'rejected'] as const).map((status) => seedCampaign({ status, cpmCents: 220 })),
    )
    // Five impressions each, on 13 Nov in Lagos, so a charge would round to a whole cent.
    const five = (c: { id: string }) => [1, 2, 3, 4, 5].map((n) => ev(c.id, { session_id: `s${n}` }))
    const res = await events({ channel: 'phoenix', events: [live, paused, ended, ...never].flatMap(five) })
    expect(await res.json()).toEqual({ accepted: 15, deduped: 0, ignored: 20 })
    const rows = await db.channelEvent.findMany({ where: { channelId: channel.id }, select: { campaignId: true } })
    expect([...new Set(rows.map((r) => r.campaignId))].sort()).toEqual([live.id, paused.id, ended.id].sort())
    // The daily job charges that day: the live campaign's delivery line, none for the campaigns that never went live.
    await runDaily(new Date('2026-11-13T12:00:00Z'), new Date('2026-11-14T02:00:00Z'), { replay: true })
    const lines = await db.ledgerEntry.findMany({ where: { kind: 'delivery' }, select: { campaignId: true, amountCents: true } })
    expect(lines).toEqual([{ campaignId: live.id, amountCents: -1 }])
  })

  it('stores and bills a late event from a run that went live, even once the campaign is back in review', async () => {
    const channel = await seedChannel()
    const admin = await db.user.create({ data: { email: 'g@x.test', name: 'G', passwordHash: 'x', isGlobalAdmin: true } })
    const c = await seedCampaign({ cpmCents: 220 })
    expect(await (await events({ channel: 'phoenix', events: [ev(c.id)] }, 'run-1')).json()).toMatchObject({ accepted: 1 })
    await endCampaign(c.id, admin.id)
    // Resubmitted after it ended, as submitCampaign leaves it: in review, with no end recorded.
    await db.campaign.update({ where: { id: c.id }, data: { status: 'review', endedAt: null } })
    const late = [1, 2, 3, 4].map((n) => ev(c.id, { session_id: `late-${n}`, ts: '2026-11-13T10:30:00Z' }))
    expect(await (await events({ channel: 'phoenix', events: late }, 'run-1-late')).json()).toEqual({ accepted: 4, deduped: 0, ignored: 0 })
    expect(await db.channelEvent.count({ where: { campaignId: c.id, channelId: channel.id } })).toBe(5)
    await runDaily(new Date('2026-11-13T12:00:00Z'), new Date('2026-11-14T02:00:00Z'), { replay: true })
    expect(await db.ledgerEntry.findMany({ where: { kind: 'delivery' }, select: { campaignId: true, amountCents: true } }))
      .toEqual([{ campaignId: c.id, amountCents: -1 }])
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
    await expectError(await events({ channel: 'phoenix', events: [ev(c.id, { type: 'share_open' })] }), 400, 'bad_request')
    await expectError(await events({ channel: 'phoenix', events: [ev(c.id, { type: 'impression', offer_id: undefined })] }), 400, 'bad_request')
    await expectError(await events({ channel: 'phoenix', events: [ev(c.id, { ts: 'yesterday' })] }), 400, 'bad_request')
    await expectError(await events('not json'), 400, 'bad_request')
    expect(await db.channelBatch.count()).toBe(0)
    const full = await events({ channel: 'phoenix', events: Array(500).fill(ev(c.id)) })
    expect(await full.json()).toEqual({ accepted: 1, deduped: 499, ignored: 0 })
  })

  it('ignores an event type it does not know, and stores the rest', async () => {
    await seedChannel()
    const c = await seedCampaign()
    const res = await events({ channel: 'phoenix', events: [ev(c.id, { type: 'view' }), ev(c.id, { type: 'claim', claim_code: 'PHX-3F9K' })] })
    expect(await res.json()).toEqual({ accepted: 1, deduped: 0, ignored: 1 })
    expect((await db.channelEvent.findMany()).map((r) => r.type)).toEqual(['Claim'])
  })

  it('stores share, share_open and share_claim against the token\'s link, and only for this channel\'s links', async () => {
    const channel = await seedChannel()
    const other = await seedChannel('boomplay', 'other_key')
    const c = await seedCampaign()
    const mine = await mintChannelLink(c.id, channel.id, 'sharer', 'whatsapp')
    const theirs = await mintChannelLink(c.id, other.id, 'sharer', 'whatsapp')
    const friend = { session_id: 'anon_friend', ts: '2026-11-13T10:07:00Z' }
    const res = await events({ channel: 'phoenix', events: [
      ev(c.id, { type: 'share', token: mine.code, via: 'whatsapp', msisdn_hash: 'ab12', placement: 'featured' }),
      { type: 'share_open', token: mine.code, ...friend },
      { type: 'share_claim', token: mine.code, ...friend },
      { type: 'share_claim', token: theirs.code, ...friend, session_id: 'anon_2' },
      { type: 'share_open', token: 'NOPE0000', ...friend, session_id: 'anon_3' },
      { type: 'share_open', token: mine.code, offer_id: 'another-offer', ...friend, session_id: 'anon_4' },
    ] })
    expect(await res.json()).toEqual({ accepted: 3, deduped: 0, ignored: 3 })
    const rows = await db.channelEvent.findMany({ orderBy: { type: 'asc' } })
    expect(rows.map((r) => [r.type, r.linkCode, r.campaignId, r.sessionId])).toEqual([
      ['Share', mine.code, c.id, 's1'],
      ['ShareOpen', mine.code, c.id, 'anon_friend'],
      ['ShareClaim', mine.code, c.id, 'anon_friend'],
    ])
    expect(await (await stats(mine.code)).json()).toMatchObject({ share_opens: 1, share_claims: 1 })
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
    expect(await res.json()).toEqual({
      opens_unique: 1, opens_all: 1, details_left: 0, claims: 0, children: 0, share_opens: 0, share_claims: 0,
    })
    await expectError(await stats('NOPE0000'), 404, 'unknown_link')
  })

  it("answers 404 for another channel's link", async () => {
    await seedChannel()
    const other = await seedChannel('boomplay', 'other_key')
    const c = await seedCampaign()
    const link = await mintChannelLink(c.id, other.id, 's', 'copy')
    await expectError(await stats(link.code), 404, 'unknown_link')
    expect((await stats(link.code, { authorization: 'Bearer other_key' })).status).toBe(200)
  })
})

describe('rotateKey', () => {
  const reqWith = (key: string) => new Request('http://localhost/api/v1/offers?country=NG', { headers: { authorization: `Bearer ${key}` } })

  it('returns a new live key once, keeps the old one for 24 hours, then refuses it', async () => {
    const channel = await seedChannel()
    const admin = await db.user.create({ data: { email: 'g@x.test', name: 'G', passwordHash: 'x', isGlobalAdmin: true } })
    const now = new Date('2026-11-13T10:00:00Z')
    const fresh = await rotateKey(channel.id, admin.id, now)
    expect(fresh).toMatch(/^phx_live_[0-9A-Za-z]{24}$/)
    const stored = await db.channel.findUniqueOrThrow({ where: { id: channel.id } })
    expect(stored).toMatchObject({
      apiKeyHash: hashKey(fresh), previousKeyHash: hashKey(KEY), keyCreatedAt: now,
      previousKeyValidUntil: new Date(now.getTime() + DAY),
    })
    expect(JSON.stringify(stored)).not.toContain(fresh)
    const at = (ms: number) => new Date(now.getTime() + ms)
    expect((await channelFromRequest(reqWith(fresh), at(0)))?.id).toBe(channel.id)
    expect((await channelFromRequest(reqWith(KEY), at(DAY - 1)))?.id).toBe(channel.id)
    expect(await channelFromRequest(reqWith(KEY), at(DAY))).toBeNull()
    expect((await channelFromRequest(reqWith(fresh), at(2 * DAY)))?.id).toBe(channel.id)
    const audit = await db.auditEvent.findFirstOrThrow({ where: { action: 'channel.key.rotate' } })
    expect(audit).toMatchObject({ actorId: admin.id, targetType: 'Channel', targetId: channel.id })
    expect(JSON.stringify(audit)).not.toContain(fresh)
  })

  it('lets both keys call the API right after a rotation, and only the newest two after a second one', async () => {
    const channel = await seedChannel()
    const admin = await db.user.create({ data: { email: 'g@x.test', name: 'G', passwordHash: 'x', isGlobalAdmin: true } })
    const first = await rotateKey(channel.id, admin.id)
    expect((await offers('country=NG')).status).toBe(200)
    expect((await offers('country=NG', { authorization: `Bearer ${first}` })).status).toBe(200)
    const second = await rotateKey(channel.id, admin.id)
    expect(second).not.toBe(first)
    await expectError(await offers('country=NG'), 401, 'unauthorized')
    expect((await offers('country=NG', { authorization: `Bearer ${first}` })).status).toBe(200)
    expect((await offers('country=NG', { authorization: `Bearer ${second}` })).status).toBe(200)
  })

  it('never lets an expired previous key in, nor a previous key of a channel that is not live', async () => {
    const live = await seedChannel()
    await db.channel.update({
      where: { id: live.id },
      data: { apiKeyHash: hashKey('current'), previousKeyHash: hashKey('old'), previousKeyValidUntil: new Date(Date.now() - 1000) },
    })
    await seedChannel('boomplay', 'dark_current', false)
    await db.channel.update({
      where: { key: 'boomplay' },
      data: { previousKeyHash: hashKey('dark_old'), previousKeyValidUntil: new Date(Date.now() + DAY) },
    })
    expect(await channelFromRequest(reqWith('old'))).toBeNull()
    expect(await channelFromRequest(reqWith('dark_old'))).toBeNull()
    expect((await channelFromRequest(reqWith('current')))?.id).toBe(live.id)
  })
})
