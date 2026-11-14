import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import InvoicesPage from '@/app/app/(console)/invoices/page'
import InvoicePrintPage from '@/app/app/(console)/invoices/[id]/print/page'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { usd } from '@/lib/format'
import { creditSummary } from '@/lib/money'

vi.mock('@/lib/auth', () => ({ auth: vi.fn(), signOut: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const jar = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => jar }))
vi.mock('next/navigation', async (o) => ({ ...(await o<typeof import('next/navigation')>()), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

let seq = 0
const at = (iso: string) => new Date(iso)
const text = (m: string) => m.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&')

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(at('2026-11-14T09:00:00Z'))
})
afterEach(() => vi.useRealTimers())

async function setup(name = 'Pesa Link') {
  const ws = await db.workspace.create({ data: { name, type: 'Brand', country: 'KE', status: 'approved', registrationNumber: 'PVT-123' } })
  const user = await db.user.create({ data: { email: `u${++seq}@x.test`, name: 'U', passwordHash: 'x' } })
  await db.workspaceMember.create({ data: { userId: user.id, workspaceId: ws.id, role: 'Owner' } })
  if (!(await db.marketFx.findFirst({ where: { country: 'KE' } }))) await db.marketFx.create({ data: { country: 'KE', fxPerUsd: 129, effectiveFrom: at('2026-09-01T00:00:00Z') } })
  return { ws, user }
}
const login = (ws: { id: string }, user: { id: string }) => {
  vi.mocked(auth).mockResolvedValue({ user: { id: user.id, isGlobalAdmin: false }, expires: '' } as never)
  jar.get.mockImplementation((k: string) => (k === 'of_ws' ? { value: ws.id } : undefined))
}
// Issued in Kenya at 130 unless the invoice says otherwise (the workspace's country can change after issue).
const invoice = (
  workspaceId: string, number: string, period: string, amountCents: number, status: 'due' | 'paid' | 'open', dueAt: string,
  issued: { country: 'KE' | 'NG'; fx: number } = { country: 'KE', fx: 130 },
) =>
  db.invoice.create({
    data: { workspaceId, number, period: at(period), amountCents, status, fxPerUsd: issued.fx, country: issued.country, issuedAt: at('2026-10-01T00:00:00Z'), dueAt: at(dueAt), paidAt: status === 'paid' ? at('2026-10-10T00:00:00Z') : null },
  })
const render = async () => text(renderToStaticMarkup(await InvoicesPage()))

describe('Invoices page', () => {
  it('shows the running month with unbilled USD, Net-14 due date and no PDF', async () => {
    const { ws, user } = await setup()
    login(ws, user)
    await db.ledgerEntry.create({ data: { workspaceId: ws.id, at: at('2026-11-03T09:00:00Z'), amountCents: -13500, description: 'x — delivery', kind: 'delivery' } })
    const c = await creditSummary(ws.id)
    expect(c.unbilledCents).toBe(13500)
    const markup = renderToStaticMarkup(await InvoicesPage())
    const t = text(markup)
    expect(t).toContain('Invoice Period Status Due USD KES')
    expect(t).toContain(`Nov 2026 (to date) Open 15 Dec ${usd(13500)} KSh17,415`)
    expect(markup).not.toContain('/print')
  })

  it('derives Paid, Due, Overdue; paid has no due date; newest first; PDF links to print', async () => {
    const { ws, user } = await setup()
    login(ws, user)
    const paid = await invoice(ws.id, 'INV-0041', '2026-09-30T21:00:00Z', 112000, 'paid', '2026-10-15T00:00:00Z')
    await invoice(ws.id, 'INV-0044', '2026-09-30T21:00:00Z', 361000, 'due', '2026-11-18T00:00:00Z')
    await invoice(ws.id, 'INV-0046', '2026-08-31T21:00:00Z', 21000, 'due', '2026-11-04T00:00:00Z')
    const markup = renderToStaticMarkup(await InvoicesPage())
    const t = text(markup)
    expect(t).toContain('INV-0041 Oct 2026 Paid — $1,120 KSh145,600 PDF')
    expect(t).toContain('INV-0044 Oct 2026 Due 18 Nov')
    expect(t).toContain('INV-0046 Sep 2026 Overdue 4 Nov $210 KSh27,300')
    expect(t.indexOf('INV-0044')).toBeLessThan(t.indexOf('INV-0041'))
    expect(markup).toContain(`/app/invoices/${paid.id}/print`)
    expect(markup).toContain('target="_blank"')
    expect(t).not.toContain('Mark paid')
  })

  it('an invoice issued in Nigeria keeps its naira after the workspace moves to Kenya; the running month is in shillings', async () => {
    const { ws, user } = await setup()
    login(ws, user)
    await invoice(ws.id, 'INV-0050', '2026-09-30T23:00:00Z', 20000, 'due', '2026-11-18T00:00:00Z', { country: 'NG', fx: 1550 })
    await db.ledgerEntry.create({ data: { workspaceId: ws.id, at: at('2026-11-03T09:00:00Z'), amountCents: -13500, description: 'x — delivery', kind: 'delivery' } })
    const t = await render()
    expect(t).toContain('INV-0050 Oct 2026 Due 18 Nov $200 ₦310,000 PDF')
    expect(t).toContain(`Nov 2026 (to date) Open 15 Dec ${usd(13500)} KSh17,415`)
  })

  it('says "No invoices yet." with nothing invoiced or unbilled', async () => {
    const { ws, user } = await setup()
    login(ws, user)
    expect(await render()).toContain('No invoices yet.')
  })
})

describe('Invoice print page', () => {
  it('lists the lines and totals in USD and local at the invoice FX, with the due date', async () => {
    const { ws, user } = await setup()
    login(ws, user)
    const inv = await invoice(ws.id, 'INV-0044', '2026-09-30T21:00:00Z', 15000, 'due', '2026-11-18T00:00:00Z')
    await db.ledgerEntry.create({ data: { workspaceId: ws.id, invoiceId: inv.id, at: at('2026-10-05T09:00:00Z'), amountCents: -12000, description: 'Send money free — delivery', kind: 'delivery' } })
    await db.ledgerEntry.create({ data: { workspaceId: ws.id, invoiceId: inv.id, at: at('2026-10-06T09:00:00Z'), amountCents: -3000, description: 'Send money free — share rewards', kind: 'reward' } })
    const t = text(renderToStaticMarkup(await InvoicePrintPage({ params: Promise.resolve({ id: inv.id }) })))
    expect(t).toContain('Invoice INV-0044')
    expect(t).toContain('Pesa Link')
    expect(t).toContain('PVT-123')
    expect(t).toContain('Period Oct 2026')
    expect(t).toContain('Due 18 Nov')
    expect(t).toContain('5 Oct Send money free — delivery $120 KSh15,600')
    expect(t).toContain('6 Oct Send money free — share rewards $30 KSh3,900')
    expect(t).toContain('Total $150 KSh19,500')
    expect(t).toContain('1 USD = KSh130')
    expect(t).toContain('Pay by bank transfer, quoting INV-0044.')
  })

  it('prints an invoice in the country it was issued under, not the workspace\'s current one', async () => {
    const { ws, user } = await setup()
    login(ws, user)
    const inv = await invoice(ws.id, 'INV-0050', '2026-09-30T23:00:00Z', 20000, 'due', '2026-11-18T00:00:00Z', { country: 'NG', fx: 1550 })
    await db.ledgerEntry.create({ data: { workspaceId: ws.id, invoiceId: inv.id, at: at('2026-10-05T09:00:00Z'), amountCents: -20000, description: 'Buy 2 get 1 — delivery', kind: 'delivery' } })
    const t = text(renderToStaticMarkup(await InvoicePrintPage({ params: Promise.resolve({ id: inv.id }) })))
    expect(t).toContain('Period Oct 2026')
    expect(t).toContain('Date Description USD NGN')
    expect(t).toContain('5 Oct Buy 2 get 1 — delivery $200 ₦310,000')
    expect(t).toContain('Total $200 ₦310,000')
    expect(t).toContain('1 USD = ₦1,550')
    expect(t).not.toContain('KSh')
  })

  it("is not found for another workspace's invoice", async () => {
    const a = await setup('A')
    const b = await setup('B')
    const inv = await invoice(b.ws.id, 'INV-0060', '2026-09-30T21:00:00Z', 100, 'due', '2026-11-18T00:00:00Z')
    login(a.ws, a.user)
    await expect(InvoicePrintPage({ params: Promise.resolve({ id: inv.id }) })).rejects.toMatchObject({ digest: expect.stringContaining('NEXT_HTTP_ERROR_FALLBACK;404') })
  })
})
