import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { GET as getPage } from '@/app/o/[code]/route'
import { POST as postClaim } from '@/app/o/[code]/claim/route'
import { POST as postDetails } from '@/app/o/[code]/details/route'
import { GET as getShare } from '@/app/o/[code]/share/route'
import { db } from '@/lib/db'
import { COPY } from '@/lib/copy'
import { type LandingView, renderLanding } from '@/lib/landing/render'
import { landingRoute } from '@/lib/landing/respond'
import { viewFor } from '@/lib/landing/view'
import { ipHash, isPreviewFetcher } from '@/lib/landing/visitor'
import { shareTargets } from '@/lib/landing/share-targets'
import { linkUrl, mintChannelLink } from '@/lib/links'

const DAY = 86_400_000
const BRAND_URL = 'https://kolabright.ng/offer'
const NG_ERROR = 'Enter a Nigerian mobile number, like 0803 123 4567.'

// Escapable and multi-byte characters: the most bytes a field of n characters can cost.
const worst = (n: number) => '\'"&<>₦'.repeat(Math.ceil(n / 6)).slice(0, n)
const view = (over: Partial<LandingView> = {}): LandingView => ({
  state: 'offer', code: 'ABCDEFGH', brand: 'Kola Bright', headline: 'Buy 2 Kola Bright, get 1 free',
  description: 'At any Kola Bright stockist.', imageUrl: null, color: null, rewardLabel: '₦50 airtime',
  endsAtText: '21 Nov', redeemMethod: 'code', ...over,
})
const long = view({
  state: 'shared', brand: worst(80), headline: worst(48), description: worst(240), rewardLabel: worst(60),
  imageUrl: '/uploads/0b5c8a4e-6f1d-4c1e-9a55-2f1b8f7c9d10.webp', claimCode: worst(24), error: worst(60),
  myUrl: 'http://localhost:3100/o/ZZZZZZZZ',
  shareTargets: { whatsapp: '/o/ZZZZZZZZ/share?via=whatsapp', sms: '/o/ZZZZZZZZ/share?via=sms', x: '/o/ZZZZZZZZ/share?via=x' },
})

describe('renderLanding', () => {
  it('stays under 60 KB with no script in every state, even at maximum field lengths', () => {
    for (const state of ['offer', 'code', 'shared', 'ended', 'error'] as const) {
      const html = renderLanding({ ...long, state })
      expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
      expect(Buffer.byteLength(html, 'utf8')).toBeLessThan(61440)
      expect(html.toLowerCase()).not.toContain('<script')
    }
  })

  it('escapes what the advertiser typed', () => {
    const html = renderLanding(view({ headline: '<script>alert(1)</script>', brand: '<SCRIPT src=x>' }))
    expect(html.toLowerCase()).not.toContain('<script')
  })

  it('shows the offer with its reward, end date, claim button and a native details form', () => {
    const html = renderLanding(view({ claimCode: 'KOLA2X1' }))
    expect(html).toContain('₦50 airtime')
    expect(html).toContain('Offer ends 21 Nov')
    expect(html).toContain('<form method="post" action="/o/ABCDEFGH/claim">')
    expect(html).toContain('Show my code')
    expect(html).toContain('<form method="post" action="/o/ABCDEFGH/details">')
    expect(html).toContain('Share and earn')
    expect(html).not.toContain('KOLA2X1')
    expect(renderLanding(view({ redeemMethod: 'link' }))).toContain('Open offer')
    expect(renderLanding(view({ state: 'code', claimCode: 'KOLA2X1' }))).toContain('KOLA2X1')
    expect(renderLanding(view({ error: NG_ERROR }))).toContain(NG_ERROR)
  })

  it('shows the sharer their link, three share buttons and a selectable copy field', () => {
    const html = renderLanding({ ...long, brand: 'Kola Bright' })
    expect(html).toContain('Your link')
    for (const via of ['whatsapp', 'sms', 'x']) expect(html).toContain(`href="/o/ZZZZZZZZ/share?via=${via}"`)
    expect(html).toMatch(/<input[^>]*readonly[^>]*value="http:\/\/localhost:3100\/o\/ZZZZZZZZ"|<input[^>]*value="http:\/\/localhost:3100\/o\/ZZZZZZZZ"[^>]*readonly/)
    expect(html).not.toContain('action="/o/ABCDEFGH/details"')
  })

  it('says the offer has ended, with the brand when known', () => {
    expect(renderLanding(view({ state: 'ended' }))).toContain('This offer has ended')
    expect(renderLanding(view({ state: 'ended' }))).toContain('Kola Bright')
  })
})

describe('shareTargets', () => {
  it('encodes the text and the URL into each medium', () => {
    const url = 'http://localhost:3100/o/ABCDEFGH'
    const enc = encodeURIComponent(`Kola Bright: Buy 2 & get 1 ${url}`)
    expect(enc).toContain('http%3A%2F%2Flocalhost%3A3100%2Fo%2FABCDEFGH')
    expect(shareTargets(url, 'Kola Bright: Buy 2 & get 1')).toEqual({
      whatsapp: `https://wa.me/?text=${enc}`,
      sms: `sms:?&body=${enc}`,
      x: `https://twitter.com/intent/tweet?text=${enc}`,
    })
  })
})

async function seed(over: Partial<Prisma.CampaignUncheckedCreateInput> = {}, approved = true) {
  const ws = await db.workspace.create({
    data: { name: 'Kola Bright', type: 'Brand', country: 'NG', status: approved ? 'approved' : 'pending' },
  })
  const campaign = await db.campaign.create({
    data: {
      workspaceId: ws.id, name: 'Buy 2 get 1', brand: 'Kola Bright', country: 'NG', category: 'Food & drink',
      headline: 'Buy 2 Kola Bright, get 1 free', description: 'At any Kola Bright stockist.', placement: 'card',
      redeemMethod: 'code', claimCode: 'KOLA2X1', budgetUsd: 100, status: 'live', shareRewardLabel: '₦50 airtime',
      startsAt: new Date(Date.now() - DAY), endsAt: new Date(Date.now() + 7 * DAY), ...over,
    },
  })
  const channel = await db.channel.upsert({
    where: { key: 'phoenix' }, update: {}, create: { key: 'phoenix', name: 'Phoenix', apiKeyHash: 'h', isLive: true },
  })
  return mintChannelLink(campaign.id, channel.id, 'sess-1', 'whatsapp')
}
const linkOffer = { redeemMethod: 'link', claimCode: null, linkUrl: BRAND_URL } as const

const params = (code: string) => ({ params: Promise.resolve({ code }) })
const page = (code: string, query = '', headers: Record<string, string> = {}) =>
  getPage(new Request(`http://localhost/o/${code}${query}`, { headers }), params(code))
type Handler = typeof postClaim
const submit = (handler: Handler, code: string, path: string, fields: Record<string, string> = {}) =>
  handler(new Request(`http://localhost/o/${code}/${path}`, { method: 'POST', body: new URLSearchParams(fields) }), params(code))
const share = (code: string, via: string) =>
  getShare(new Request(`http://localhost/o/${code}/share?via=${via}`), params(code))
const events = (type: 'Open' | 'Claim' | 'DetailsLeft') =>
  db.linkEvent.findMany({ where: { type }, orderBy: { at: 'asc' } })

describe('viewFor', () => {
  it("prints the offer's last day, not the exclusive midnight it stops at", async () => {
    const link = await seed()
    await db.campaign.update({ where: { id: link.campaignId }, data: { endsAt: new Date('2026-11-27T00:00:00Z') } })
    const withCampaign = await db.shareLink.findUniqueOrThrow({ where: { id: link.id }, include: { campaign: true } })
    expect(renderLanding(viewFor(withCampaign, 'offer'))).toContain('Offer ends 26 Nov')
  })
})

describe('GET /o/[code]', () => {
  it('renders the offer, sets a year-long og_v cookie and logs an Open with a hashed IP', async () => {
    const link = await seed()
    const res = await page(link.code, '', { 'x-forwarded-for': '203.0.113.7, 10.0.0.1', 'user-agent': 'Tecno Spark' })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8')
    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toMatch(/^og_v=[0-9a-f-]{36}; Max-Age=31536000; Path=\/; HttpOnly; SameSite=Lax$/)
    const html = await res.text()
    expect(html).toContain('Buy 2 Kola Bright, get 1 free')
    expect(html).not.toContain('KOLA2X1')
    const [open] = await events('Open')
    const salt = process.env.IP_HASH_SALT || 'dev-salt'
    expect(open).toMatchObject({
      linkId: link.id, visitorId: cookie.slice(5, 41), userAgent: 'Tecno Spark', deduped: false,
      ipHash: createHash('sha256').update(`203.0.113.7${salt}`).digest('hex'),
    })
  })

  it('dedupes the second open from the same og_v cookie and sets no new cookie', async () => {
    const link = await seed()
    const cookie = { cookie: 'other=1; og_v=6f1d4c1e-9a55-4f1b-8f7c-9d100b5c8a4e' }
    await page(link.code, '', cookie)
    const second = await page(link.code, '', cookie)
    expect(second.headers.get('set-cookie')).toBeNull()
    expect((await events('Open')).map((e) => [e.visitorId, e.deduped])).toEqual([
      ['6f1d4c1e-9a55-4f1b-8f7c-9d100b5c8a4e', false],
      ['6f1d4c1e-9a55-4f1b-8f7c-9d100b5c8a4e', true],
    ])
  })

  it('answers 410 "This offer has ended" for an unknown code, an ended campaign or an unapproved workspace', async () => {
    const unknown = await page('NOPE0000')
    expect(unknown.status).toBe(410)
    expect(await unknown.text()).toContain('This offer has ended')
    const past = await seed({ ...linkOffer, status: 'ended', startsAt: new Date(Date.now() - 9 * DAY), endsAt: new Date(Date.now() - DAY) })
    const pending = await seed({}, false)
    for (const code of [past.code, pending.code]) {
      for (const res of [await page(code), await page(code, '?go=claim')]) {
        expect(res.status).toBe(410)
        expect(res.headers.get('location')).toBeNull()
        expect(await res.text()).toContain('Kola Bright')
      }
    }
    expect(await db.linkEvent.count()).toBe(0)
  })

  it('renders a code offer for ?go=claim and never redirects', async () => {
    const link = await seed()
    const res = await page(link.code, '?go=claim')
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
    expect(await events('Claim')).toHaveLength(0)
  })

  it('logs one Claim and no Open, then sends a link offer to the brand for ?go=claim', async () => {
    const link = await seed(linkOffer)
    const res = await page(link.code, '?go=claim')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(BRAND_URL)
    expect(await events('Claim')).toHaveLength(1)
    expect(await events('Open')).toHaveLength(0)
  })

  it('percent-encodes a brand link outside Latin-1 into a valid Location, after exactly one Claim per claim', async () => {
    const link = await seed({ ...linkOffer, linkUrl: 'https://kolabright.ng/₦50 off' })
    const encoded = 'https://kolabright.ng/%E2%82%A650%20off'
    const viaGet = await page(link.code, '?go=claim')
    expect(viaGet.status).toBe(302)
    expect(viaGet.headers.get('location')).toBe(encoded)
    expect(await events('Claim')).toHaveLength(1)
    const viaPost = await submit(postClaim, link.code, 'claim')
    expect(viaPost.status).toBe(302)
    expect(viaPost.headers.get('location')).toBe(encoded)
    expect(await events('Claim')).toHaveLength(2)
  })

  it("renders the page for a chat app's link preview without a cookie or any event", async () => {
    const link = await seed()
    const res = await page(link.code, '', { 'user-agent': 'WhatsApp/2.23.20.0 A' })
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(await res.text()).toContain('Buy 2 Kola Bright, get 1 free')
    const viaClaim = await seed(linkOffer)
    const sent = await page(viaClaim.code, '?go=claim', { 'user-agent': 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)' })
    expect(sent.status).toBe(302)
    expect(sent.headers.get('set-cookie')).toBeNull()
    expect(await db.linkEvent.count()).toBe(0)
  })

  it('answers HEAD with an empty 204: no cookie, no Open, no Claim', async () => {
    const link = await seed(linkOffer)
    for (const query of ['', '?go=claim']) {
      const res = await getPage(new Request(`http://localhost/o/${link.code}${query}`, { method: 'HEAD' }), params(link.code))
      expect(res.status).toBe(204)
      expect(res.headers.get('set-cookie')).toBeNull()
      expect(res.headers.get('location')).toBeNull()
      expect(await res.text()).toBe('')
    }
    expect(await db.linkEvent.count()).toBe(0)
  })
})

describe('isPreviewFetcher', () => {
  it('knows the link-preview fetchers chat apps and search engines send', () => {
    expect(isPreviewFetcher('WhatsApp/2.23.20.0 A')).toBe(true)
    expect(isPreviewFetcher('facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)')).toBe(true)
    expect(isPreviewFetcher('Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)')).toBe(true)
  })

  it('treats a phone browser, and a request with no user agent, as a person', () => {
    const chrome =
      'Mozilla/5.0 (Linux; Android 13; TECNO KJ5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36'
    expect(isPreviewFetcher(chrome)).toBe(false)
    expect(isPreviewFetcher('')).toBe(false)
  })
})

describe('ipHash salt', () => {
  const req = new Request('http://localhost/o/X', { headers: { 'x-real-ip': '203.0.113.7' } })

  it('refuses to hash in production without a salt of at least 16 characters', () => {
    try {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('IP_HASH_SALT', '')
      expect(() => ipHash(req)).toThrow('IP_HASH_SALT')
      vi.stubEnv('IP_HASH_SALT', 'fifteen-chars!!')
      expect(() => ipHash(req)).toThrow('IP_HASH_SALT')
      vi.stubEnv('IP_HASH_SALT', 'a-real-secret-salt')
      expect(ipHash(req)).toBe(createHash('sha256').update('203.0.113.7a-real-secret-salt').digest('hex'))
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('falls back to the dev salt outside production', () => {
    try {
      vi.stubEnv('NODE_ENV', 'test')
      vi.stubEnv('IP_HASH_SALT', '')
      expect(ipHash(req)).toBe(createHash('sha256').update('203.0.113.7dev-salt').digest('hex'))
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

describe('landingRoute', () => {
  it('answers a 500 page with no script when something underneath throws, and logs it', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const route = landingRoute(async () => {
      throw new Error('boom')
    })
    const res = await route(new Request('http://localhost/o/ABCDEFGH'), params('ABCDEFGH'))
    const logged = log.mock.calls.length
    log.mockRestore()
    expect(res.status).toBe(500)
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8')
    const html = await res.text()
    expect(html).toContain(COPY.landing.error)
    expect(html.toLowerCase()).not.toContain('<script')
    expect(logged).toBe(1)
  })
})

describe('POST /o/[code]/claim', () => {
  it("reveals this visitor's own PHX code on a code offer and redirects a link offer, logging a Claim each time", async () => {
    const code = await seed()
    const shown = await submit(postClaim, code.code, 'claim')
    expect(shown.status).toBe(200)
    const html = await shown.text()
    const issued = /PHX-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}/.exec(html)?.[0]
    expect(issued).toBeDefined()
    expect(html).not.toContain('KOLA2X1')
    const visitorId = (shown.headers.get('set-cookie') ?? '').slice(5, 41)
    expect(await db.claimCode.findFirstOrThrow()).toMatchObject({
      code: issued, campaignId: code.campaignId, channelId: code.channelId, sessionId: visitorId,
    })
    const link = await seed(linkOffer)
    const sent = await submit(postClaim, link.code, 'claim')
    expect(sent.status).toBe(302)
    expect(sent.headers.get('location')).toBe(BRAND_URL)
    expect((await events('Claim')).map((e) => e.linkId)).toEqual([code.id, link.id])
    expect(await db.claimCode.count()).toBe(1)
  })

  it('shows the same visitor the same code again that day, and another visitor a code of their own', async () => {
    const link = await seed()
    const cookie = 'og_v=6f1d4c1e-9a55-4f1b-8f7c-9d100b5c8a4e'
    const ask = (c?: string) =>
      postClaim(new Request(`http://localhost/o/${link.code}/claim`, {
        method: 'POST', body: new URLSearchParams(), headers: c ? { cookie: c } : {},
      }), params(link.code))
    const shown = async (res: Response) => /PHX-[0-9A-Z]{4}/.exec(await res.text())?.[0]
    const first = await shown(await ask(cookie))
    const again = await shown(await ask(cookie))
    const stranger = await shown(await ask())
    expect(first).toBeDefined()
    expect(again).toBe(first)
    expect(stranger).not.toBe(first)
    expect(await db.claimCode.count()).toBe(2)
    expect(await events('Claim')).toHaveLength(3)
  })
})

describe('POST /o/[code]/details', () => {
  it('refuses a number from outside the campaign country without saving anyone', async () => {
    const link = await seed()
    const res = await submit(postDetails, link.code, 'details', { name: 'Ada', phone: '+44 7700 900123' })
    expect(res.status).toBe(200)
    expect(await res.text()).toContain(NG_ERROR)
    expect(await db.consumer.count()).toBe(0)
    expect(await db.shareLink.count()).toBe(2)
    expect(await events('DetailsLeft')).toHaveLength(0)
  })

  it('saves the consumer, mints their link one level down and shows it with redirect-through share buttons', async () => {
    const link = await seed()
    const res = await submit(postDetails, link.code, 'details', { name: 'Ada', phone: '0803 123 4567' })
    expect(res.status).toBe(200)
    const consumer = await db.consumer.findUniqueOrThrow({ where: { phone: '+2348031234567' } })
    expect(consumer).toMatchObject({ name: 'Ada', country: 'NG' })
    const mine = await db.shareLink.findFirstOrThrow({ where: { consumerId: consumer.id } })
    expect(mine).toMatchObject({ parentId: link.id, depth: link.depth + 1, sharerType: 'Consumer', via: null })
    expect((await events('DetailsLeft')).map((e) => e.linkId)).toEqual([link.id])
    const html = await res.text()
    for (const via of ['whatsapp', 'sms', 'x']) expect(html).toContain(`/o/${mine.code}/share?via=${via}`)
    expect(html).toContain(`value="${linkUrl(mine.code)}"`)
  })

  const shownCode = async (res: Response) => /\/o\/([0-9A-Z]{8})\/share\?via=whatsapp/.exec(await res.text())?.[1]

  it('hands back the same link, and counts details once, when the same number is sent again', async () => {
    const link = await seed()
    const first = await submit(postDetails, link.code, 'details', { name: 'Ada', phone: '0803 123 4567' })
    const again = await submit(postDetails, link.code, 'details', { phone: '+234 803 123 4567' })
    expect([first.status, again.status]).toEqual([200, 200])
    const mine = await db.shareLink.findMany({ where: { sharerType: 'Consumer' } })
    expect(mine).toHaveLength(1)
    expect([await shownCode(first), await shownCode(again)]).toEqual([mine[0].code, mine[0].code])
    expect(await events('DetailsLeft')).toHaveLength(1)
    expect(await db.consumer.findUniqueOrThrow({ where: { phone: '+2348031234567' } })).toMatchObject({ name: 'Ada' })
  })

  it('mints one link and counts details once when the same number arrives twice at once', async () => {
    const link = await seed()
    const both = await Promise.all([1, 2].map(() => submit(postDetails, link.code, 'details', { phone: '08031234567' })))
    const mine = await db.shareLink.findMany({ where: { sharerType: 'Consumer' } })
    expect(mine).toHaveLength(1)
    expect(await Promise.all(both.map(shownCode))).toEqual([mine[0].code, mine[0].code])
    expect(await events('DetailsLeft')).toHaveLength(1)
  })
})

describe('GET /o/[code]/share', () => {
  it('stores the medium on the consumer link and forwards to the plain share target', async () => {
    const link = await seed()
    await submit(postDetails, link.code, 'details', { phone: '08031234567' })
    const mine = await db.shareLink.findFirstOrThrow({ where: { sharerType: 'Consumer' } })
    const res = await share(mine.code, 'whatsapp')
    expect(res.status).toBe(302)
    const text = `Kola Bright: Buy 2 Kola Bright, get 1 free ${linkUrl(mine.code)}`
    expect(res.headers.get('location')).toBe(`https://wa.me/?text=${encodeURIComponent(text)}`)
    expect((await db.shareLink.findUniqueOrThrow({ where: { id: mine.id } })).via).toBe('whatsapp')
    const odd = await share(mine.code, 'telegram')
    expect(odd.headers.get('location')).toBe(linkUrl(mine.code))
    expect((await db.shareLink.findUniqueOrThrow({ where: { id: mine.id } })).via).toBe('other')
  })

  it('leaves the medium Phoenix recorded on a channel link untouched', async () => {
    const link = await seed()
    expect((await share(link.code, 'sms')).status).toBe(302)
    expect((await db.shareLink.findUniqueOrThrow({ where: { id: link.id } })).via).toBe('whatsapp')
  })
})
