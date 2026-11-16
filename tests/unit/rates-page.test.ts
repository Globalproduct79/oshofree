import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import RatesPage from '@/app/admin/rates/page'
import { setFxAction, setRateAction } from '@/app/admin/rates/actions'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const NOT_FOUND = /NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK;404/

async function signIn(isGlobalAdmin: boolean) {
  const user = await db.user.create({ data: { email: 'u@x.test', name: 'U', passwordHash: 'x', isGlobalAdmin } })
  vi.mocked(auth).mockResolvedValue({ user: { id: user.id, isGlobalAdmin }, expires: '' } as never)
}

describe('/admin/rates', () => {
  it('is refused to a signed-in non-admin', async () => {
    await signIn(false)
    await expect(Promise.resolve().then(() => RatesPage())).rejects.toMatchObject({ digest: expect.stringMatching(NOT_FOUND) })
    await expect(setRateAction('NG', 'card', 1.2)).rejects.toMatchObject({ digest: expect.stringMatching(NOT_FOUND) })
  })

  it('renders five countries, the Boomplay pill and the right-hand boxes', async () => {
    await signIn(true)
    const ch = await db.channel.create({ data: { key: 'phoenix', name: 'Phoenix Browser', apiKeyHash: 'x' } })
    await db.rateCard.create({ data: { channelId: ch.id, country: 'NG', placement: 'card', cpmCents: 120, effectiveFrom: new Date(Date.now() - 1000) } })
    await db.marketFx.create({ data: { country: 'NG', fxPerUsd: 1550, effectiveFrom: new Date(Date.now() - 1000) } })
    const html = renderToStaticMarkup(await RatesPage())
    for (const n of ['Nigeria', 'Kenya', 'Ghana', 'Tanzania', 'Senegal']) expect(html).toContain(n)
    expect(html).toContain('Boomplay')
    expect(html).toContain('coming soon')
    expect(html).toContain('Expected open rates')
    expect(html).toContain('3.6%')
    expect(html).toContain('₦')
    expect(html).toContain('value="1550"')
    expect(html).toContain('value="1.20"')
  })

  it('still renders without a Phoenix channel', async () => {
    await signIn(true)
    const html = renderToStaticMarkup(await RatesPage())
    expect(html).toContain('Senegal')
  })

  // Prompt 9: the pill says what the channel row says, not the prototype's fixed "live".
  it("reads Phoenix's pill from its channel: live, not live, or not set up", async () => {
    await signIn(true)
    const pill = async () => /Phoenix Browser<i>([^<]*)<\/i>/.exec(renderToStaticMarkup(await RatesPage()))?.[1]
    expect(await pill()).toBe('not set up')
    const ch = await db.channel.create({ data: { key: 'phoenix', name: 'Phoenix Browser', apiKeyHash: 'x', isLive: false } })
    expect(await pill()).toBe('not live')
    await db.channel.update({ where: { id: ch.id }, data: { isLive: true } })
    expect(await pill()).toBe('live')
  })

  it('actions validate, write, audit and return a toast', async () => {
    await signIn(true)
    await db.channel.create({ data: { key: 'phoenix', name: 'Phoenix Browser', apiKeyHash: 'x' } })
    expect(await setRateAction('NG', 'card', 0)).toHaveProperty('error')
    expect(await setRateAction('NG', 'card', 1.25)).toEqual({ toast: 'Rate updated for new campaigns' })
    expect((await db.rateCard.findFirstOrThrow()).cpmCents).toBe(125)
    expect(await setFxAction('NG', -1)).toHaveProperty('error')
    expect(await setFxAction('NG', 1600)).toEqual({ toast: 'FX updated for new invoices' })
  })
})
