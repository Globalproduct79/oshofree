import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import ApiDocsPage from '@/app/admin/api/page'
import { rotateKeyAction } from '@/app/admin/api/actions'
import { auth } from '@/lib/auth'
import { channelFromRequest, hashKey } from '@/lib/channels'
import { db } from '@/lib/db'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const NOT_FOUND = /NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK;404/

async function signIn(isGlobalAdmin: boolean) {
  const user = await db.user.create({ data: { email: 'u@x.test', name: 'U', passwordHash: 'x', isGlobalAdmin } })
  vi.mocked(auth).mockResolvedValue({ user: { id: user.id, isGlobalAdmin }, expires: '' } as never)
  return user
}

const phoenix = () =>
  db.channel.create({
    data: { key: 'phoenix', name: 'Phoenix Browser', apiKeyHash: hashKey('old_key'), isLive: true, keyCreatedAt: new Date('2026-11-02T09:00:00Z') },
  })

describe('/admin/api', () => {
  it('shows the three contract boxes, the four reference boxes and the Keys box', async () => {
    await signIn(true)
    await phoenix()
    const html = renderToStaticMarkup(await ApiDocsPage())
    for (const title of ['1 · Offers out', '2 · Events in', '3 · Share token', 'Link stats', 'Auth and limits', 'Keys', 'Claim codes', 'Webhooks to Phoenix (planned)', 'Boomplay'])
      expect(html).toContain(`<h3>${title}</h3>`)
    // Not enforced or sent by the server yet, so the page says so.
    expect(html).toContain('<td>Rate limit (planned)</td>')
    expect(html).toContain(`${process.env.APP_URL}/api/v1/offers?country=KE&amp;channel=phoenix`)
    expect(html).toContain('POST /api/v1/claims')
    expect(html).toContain(`${process.env.APP_URL}/api/v1/links/K4Q7ZX2A/stats`)
    for (const field of ['opens_unique', 'details_left', 'children', 'share_opens', 'share_claims'])
      expect(html).toContain(`<span class="k">&quot;${field}&quot;</span>`)
    expect(html).toContain('unknown_link')
    // What Phoenix sends to mint a sharer's own link, and what it gets back.
    expect(html).toContain(`${process.env.APP_URL}/api/v1/share`)
    for (const field of ['offer_id', 'session_id', 'via', 'msisdn'])
      expect(html).toContain(`<span class="k">&quot;${field}&quot;</span>`)
    expect(html).toContain(`&quot;url&quot;: &quot;${process.env.APP_URL}/o/K4Q7ZX2A&quot;`)
    // How a card is drawn, and where its links come from.
    for (const token of ['creative.image', 'creative.video', 'creative.color', 'cta.type', 'cta.url'])
      expect(html).toContain(`<span class="tok">${token}</span>`)
    expect(html).toContain(`${process.env.APP_URL}/o/`)
    expect(html).not.toContain('offergrid')
    expect(html).not.toContain('og.link')
    expect(html).toContain('Rotate key')
    expect(html).toContain('2 Nov')
    expect(html).toContain(`Environments: this server is <span class="tok">${process.env.APP_URL}</span>`)
    // Highlighted like the prototype: keys, strings, literals and the request lines.
    expect(html).toContain('<span class="k">&quot;placement&quot;</span>')
    expect(html).toContain('<span class="s">&quot;featured&quot;</span>')
    expect(html).toContain('<span class="n">900</span>')
    expect(html).toContain('<span class="c">GET</span>')
  })

  it('still renders, without a Rotate key button, when Phoenix is not set up', async () => {
    await signIn(true)
    const html = renderToStaticMarkup(await ApiDocsPage())
    expect(html).toContain('<h3>Keys</h3>')
    expect(html).not.toContain('Rotate key')
  })

  it('refuses rotation to a non-admin and changes nothing', async () => {
    await signIn(false)
    const ch = await phoenix()
    await expect(rotateKeyAction()).rejects.toMatchObject({ digest: expect.stringMatching(NOT_FOUND) })
    expect((await db.channel.findUniqueOrThrow({ where: { id: ch.id } })).apiKeyHash).toBe(hashKey('old_key'))
  })

  it('rotates the Phoenix key for Global, hands the new key back once and audits it', async () => {
    const admin = await signIn(true)
    await phoenix()
    const res = await rotateKeyAction()
    if (!('key' in res)) throw new Error('expected a key')
    expect(res.key).toMatch(/^phx_live_/)
    const req = (k: string) => new Request('http://localhost/api/v1/offers', { headers: { authorization: `Bearer ${k}` } })
    expect(await channelFromRequest(req(res.key))).not.toBeNull()
    expect(await channelFromRequest(req('old_key'))).not.toBeNull()
    expect(await db.auditEvent.count({ where: { action: 'channel.key.rotate', actorId: admin.id } })).toBe(1)
  })

  it('says Phoenix is not set up when there is no channel to rotate', async () => {
    await signIn(true)
    expect(await rotateKeyAction()).toEqual({ error: 'Phoenix is not set up yet.' })
  })
})
