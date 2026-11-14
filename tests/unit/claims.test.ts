import type { Prisma, WorkspaceStatus } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { POST as postClaims } from '@/app/api/v1/claims/route'
import { hashKey } from '@/lib/channels'
import { CLAIM_ALPHABET, issueClaimCode } from '@/lib/claims'
import { db } from '@/lib/db'

const KEY = 'phx_claims_key'
const DAY = 86_400_000
const auth = { authorization: `Bearer ${KEY}` }
const CODE = /^PHX-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/

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

const claim = (body: unknown, headers: Record<string, string> = auth) =>
  postClaims(new Request('http://localhost/api/v1/claims', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }))

describe('the claim code alphabet', () => {
  it('has no ambiguous characters', () => {
    for (const c of ['0', 'O', '1', 'I']) expect(CLAIM_ALPHABET).not.toContain(c)
    expect(new Set(CLAIM_ALPHABET).size).toBe(CLAIM_ALPHABET.length)
  })
})

describe('issueClaimCode', () => {
  it('issues PHX-XXXX valid until the campaign ends, one per session per offer per UTC day', async () => {
    const channel = await seedChannel()
    const c = await seedCampaign()
    const morning = new Date('2026-11-13T00:30:00Z')
    const first = await issueClaimCode(c.id, channel.id, 'sess-1', morning)
    expect(first.code).toMatch(CODE)
    expect(first.validUntil).toEqual(c.endsAt)
    expect(first.created).toBe(true)
    const again = await issueClaimCode(c.id, channel.id, 'sess-1', new Date('2026-11-13T23:59:59Z'))
    expect(again).toEqual({ ...first, created: false })
    const tomorrow = await issueClaimCode(c.id, channel.id, 'sess-1', new Date('2026-11-14T00:00:00Z'))
    const friend = await issueClaimCode(c.id, channel.id, 'sess-2', morning)
    expect(new Set([first.code, tomorrow.code, friend.code]).size).toBe(3)
    const rows = await db.claimCode.findMany({ orderBy: { createdAt: 'asc' } })
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({
      code: first.code, campaignId: c.id, channelId: channel.id, sessionId: 'sess-1',
      day: new Date('2026-11-13T00:00:00Z'), validUntil: c.endsAt,
    })
  })

  it('gives each channel its own code for the same session', async () => {
    const phoenix = await seedChannel()
    const boomplay = await seedChannel('boomplay', 'bmp_key')
    const c = await seedCampaign()
    const now = new Date('2026-11-13T10:00:00Z')
    const a = await issueClaimCode(c.id, phoenix.id, 's', now)
    const b = await issueClaimCode(c.id, boomplay.id, 's', now)
    expect(a.code).not.toBe(b.code)
  })

  it('draws again when a code is already taken', async () => {
    const channel = await seedChannel()
    const c = await seedCampaign()
    const now = new Date('2026-11-13T10:00:00Z')
    const taken = await issueClaimCode(c.id, channel.id, 'sess-1', now)
    const draws = [taken.code, taken.code, 'PHX-ZZZZ']
    const next = await issueClaimCode(c.id, channel.id, 'sess-2', now, () => draws.shift()!)
    expect(next.code).toBe('PHX-ZZZZ')
    expect(draws).toEqual([])
  })

  it('lets two campaigns issue the same code string, since a code is unique only within its campaign', async () => {
    const channel = await seedChannel()
    const a = await seedCampaign()
    const b = await seedCampaign()
    const now = new Date('2026-11-13T10:00:00Z')
    const same = () => 'PHX-K4Q7'
    expect((await issueClaimCode(a.id, channel.id, 'sess-1', now, same)).code).toBe('PHX-K4Q7')
    expect((await issueClaimCode(b.id, channel.id, 'sess-2', now, same)).code).toBe('PHX-K4Q7')
    expect(await db.claimCode.count({ where: { code: 'PHX-K4Q7' } })).toBe(2)
  })

  it('hands both of two concurrent asks the same code', async () => {
    const channel = await seedChannel()
    const c = await seedCampaign()
    const now = new Date('2026-11-13T10:00:00Z')
    const both = await Promise.all([1, 2, 3].map(() => issueClaimCode(c.id, channel.id, 'sess-1', now)))
    expect(new Set(both.map((b) => b.code)).size).toBe(1)
    expect(await db.claimCode.count()).toBe(1)
  })
})

describe('POST /api/v1/claims', () => {
  it('answers 201 with a code and valid_until, then 200 with the same code that day', async () => {
    const channel = await seedChannel()
    const c = await seedCampaign()
    const res = await claim({ offer_id: c.id, session_id: 'anon_1' })
    expect(res.status).toBe(201)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = await res.json()
    expect(body).toEqual({ code: expect.stringMatching(CODE), valid_until: c.endsAt.toISOString() })
    const again = await claim({ offer_id: c.id, session_id: 'anon_1' })
    expect(again.status).toBe(200)
    expect(await again.json()).toEqual(body)
    expect(await db.claimCode.findFirstOrThrow()).toMatchObject({ channelId: channel.id, sessionId: 'anon_1' })
  })

  it('answers 404 unknown_offer for an offer that is unknown or not delivering', async () => {
    await seedChannel()
    const ended = await seedCampaign({ status: 'ended' })
    const paused = await seedCampaign({ status: 'paused' })
    const declined = await seedCampaign({}, 'declined')
    for (const offer_id of ['nope', ended.id, paused.id, declined.id]) {
      const res = await claim({ offer_id, session_id: 's' })
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: 'unknown_offer' })
    }
    expect(await db.claimCode.count()).toBe(0)
  })

  it('answers 400 for a body outside the contract and 401 without a key', async () => {
    await seedChannel()
    const c = await seedCampaign()
    for (const body of [{ offer_id: c.id }, { session_id: 's' }, { offer_id: c.id, session_id: '' }, 'not json']) {
      const res = await claim(body)
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'bad_request' })
    }
    expect((await claim({ offer_id: c.id, session_id: 's' }, {})).status).toBe(401)
    expect(await db.claimCode.count()).toBe(0)
  })
})
