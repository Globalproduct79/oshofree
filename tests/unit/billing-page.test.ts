import type { CampaignStatus } from '@prisma/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requestCreditAction } from '@/app/app/(console)/billing/actions'
import BillingPage from '@/app/app/(console)/billing/page'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { usd } from '@/lib/format'
import { creditSummary } from '@/lib/money'

vi.mock('@/lib/auth', () => ({ auth: vi.fn(), signOut: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const jar = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }))
vi.mock('next/navigation', async (o) => ({ ...(await o<typeof import('next/navigation')>()), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('next/headers', () => ({ cookies: async () => jar }))

let seq = 0
const at = (iso: string) => new Date(iso)
const text = (m: string) => m.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&')

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(at('2026-11-14T09:00:00Z'))
})
afterEach(() => vi.useRealTimers())

async function setup(o: { role?: 'Owner' | 'Manager' | 'Viewer'; country?: 'KE' | 'GH'; limit?: number; fx?: boolean } = {}) {
  const country = o.country ?? 'KE'
  const ws = await db.workspace.create({ data: { name: 'Pesa Link', type: 'Brand', country, status: 'approved', creditLimitCents: o.limit ?? 150000 } })
  const user = await db.user.create({ data: { email: `u${++seq}@x.test`, name: 'U', passwordHash: 'x' } })
  await db.workspaceMember.create({ data: { userId: user.id, workspaceId: ws.id, role: o.role ?? 'Owner' } })
  if (o.fx !== false && country === 'KE') await db.marketFx.create({ data: { country: 'KE', fxPerUsd: 129, effectiveFrom: at('2026-09-01T00:00:00Z') } })
  vi.mocked(auth).mockResolvedValue({ user: { id: user.id, isGlobalAdmin: false }, expires: '' } as never)
  jar.get.mockImplementation((k: string) => (k === 'of_ws' ? { value: ws.id } : undefined))
  return { ws, user }
}

const campaign = (workspaceId: string, name: string, status: CampaignStatus, budgetUsd: number) =>
  db.campaign.create({
    data: {
      workspaceId, name, brand: 'B', country: 'KE', category: 'Retail', headline: name, description: 'd', placement: 'card',
      redeemMethod: 'code', budgetUsd, shareRewardLabel: 'x', status, startsAt: at('2026-10-01T00:00:00Z'), endsAt: at('2026-12-01T00:00:00Z'),
    },
  })

const ledger = (workspaceId: string, iso: string, amountCents: number, description: string, kind: 'delivery' | 'reward' | 'payment' = 'delivery') =>
  db.ledgerEntry.create({ data: { workspaceId, at: at(iso), amountCents, description, kind } })

async function fixture(o: Parameters<typeof setup>[0] = {}) {
  const s = await setup(o)
  await campaign(s.ws.id, 'Send money free', 'live', 300)
  await db.invoice.create({
    data: { workspaceId: s.ws.id, number: 'INV-0041', period: at('2026-09-30T21:00:00Z'), amountCents: 21000, status: 'due', fxPerUsd: 129, country: s.ws.country, issuedAt: at('2026-10-01T00:00:00Z'), dueAt: at('2026-10-15T00:00:00Z') },
  })
  await ledger(s.ws.id, '2026-11-03T09:00:00Z', -11800, 'Send money free — delivery')
  await ledger(s.ws.id, '2026-11-03T09:00:00Z', -1700, 'Send money free — share rewards', 'reward')
  await ledger(s.ws.id, '2026-11-10T09:00:00Z', 112000, 'INV-0040 paid', 'payment')
  await ledger(s.ws.id, '2026-10-28T09:00:00Z', -15000, 'August multipack — delivery')
  return s
}

async function render(month?: string) {
  const markup = renderToStaticMarkup(await BillingPage({ searchParams: Promise.resolve(month ? { month } : {}) }))
  return { markup, text: text(markup) }
}

describe('Billing page', () => {
  it('shows the head and the four KPIs from the credit summary', async () => {
    const { ws } = await fixture()
    const c = await creditSummary(ws.id)
    const { text: t } = await render()
    expect(t).toContain('Billing & credit')
    expect(t).toContain('Invoices')
    expect(t).toContain('Credit limit $1,500 set by Global')
    expect(t).toContain(`In use ${usd(c.inUseCents)} open invoices + running campaigns`)
    expect(t).toContain(`Available ${usd(c.availableCents)} for new campaigns`)
    expect(t).toContain(`Unbilled this month ${usd(c.unbilledCents)} invoiced on the 1st · KSh`)
    expect(t).not.toContain('Credit limit reached.')
  })

  it('shows the alert only when over the limit', async () => {
    const { ws } = await fixture({ limit: 50000 })
    expect((await creditSummary(ws.id)).overLimit).toBe(true)
    const { text: t } = await render()
    expect(t).toContain('Credit limit reached. Live campaigns pause until an invoice is paid or Global raises the limit.')
  })

  it('says "close to the limit" above 85 % of the limit', async () => {
    const { ws } = await fixture({ limit: 90000 })
    const c = await creditSummary(ws.id)
    expect(c, JSON.stringify(c)).toMatchObject({ nearLimit: true, overLimit: false })
    const { text: t } = await render()
    expect(t).toContain('close to the limit')
    expect(t).not.toContain('for new campaigns')
  })

  it('lists the month statement newest first with the payment in green', async () => {
    await fixture()
    const { markup, text: t } = await render()
    expect(t).toContain('Date Description USD KES')
    const iPay = t.indexOf('INV-0040 paid'), iRew = t.indexOf('share rewards'), iDel = t.indexOf('Send money free — delivery')
    expect(iPay).toBeGreaterThan(-1)
    expect(iPay).toBeLessThan(iDel)
    expect(iRew).toBeLessThan(iDel === -1 ? Infinity : iDel + 100)
    expect(t).not.toContain('August multipack')
    expect(t).toContain('−$118')
    expect(markup).toMatch(/color:#0E9F6E[^>]*>\$1,120</)
  })

  it('lists months with rows (and the current one) and ?month= filters', async () => {
    await fixture()
    const { markup, text: t } = await render('2026-10')
    expect(markup).toContain('/app/billing?month=2026-11')
    expect(markup).toContain('/app/billing?month=2026-10')
    expect(t).toContain('Nov 2026 Oct 2026')
    expect(t).toContain('August multipack — delivery')
    expect(t).not.toContain('INV-0040 paid')
  })

  it('offers the current month even with no rows, and an empty statement says so', async () => {
    await setup()
    const { markup, text: t } = await render()
    expect(markup).toContain('/app/billing?month=2026-11')
    expect(t).toContain('Nothing charged yet. Delivery and rewards appear here daily once a campaign is live.')
  })

  it('explains how you pay with the month rate, terms, next invoice and manager', async () => {
    await setup()
    const { text: t } = await render()
    expect(t).toContain('in KES at a rate fixed for the month (1 USD = KSh129 in November). Pay by bank transfer within 14 days')
    expect(t).toContain('Billing currency KES')
    expect(t).toContain('Terms Net 14')
    expect(t).toContain('Next invoice 1 Dec')
    expect(t).toContain('Account manager Obinna A.')
    expect(t).toContain('Need more credit?')
    expect(t).toContain('Request a higher limit')
  })

  it('shows "—" without throwing when the market has no FX', async () => {
    const { ws } = await setup({ country: 'GH' })
    await ledger(ws.id, '2026-11-03T09:00:00Z', -1000, 'x — delivery')
    const { text: t } = await render()
    expect(t).toContain('1 USD = GH₵— in November')
    expect(t).toContain('−$10 —')
  })

  it('hides the request button from a Manager and a Viewer', async () => {
    await setup({ role: 'Manager' })
    expect((await render()).text).not.toContain('Request a higher limit')
    await setup({ role: 'Viewer' })
    expect((await render()).text).not.toContain('Request a higher limit')
  })
})

describe('requestCreditAction', () => {
  it('creates one open request for an Owner; a second click creates none', async () => {
    const { ws } = await setup()
    expect(await requestCreditAction()).toEqual({ ok: true })
    expect(await requestCreditAction()).toEqual({ ok: true })
    expect(await db.creditRequest.count({ where: { workspaceId: ws.id, status: 'open' } })).toBe(1)
  })

  it('refuses a Manager', async () => {
    const { ws } = await setup({ role: 'Manager' })
    await expect(requestCreditAction()).rejects.toBe('FORBIDDEN')
    expect(await db.creditRequest.count({ where: { workspaceId: ws.id } })).toBe(0)
  })
})
