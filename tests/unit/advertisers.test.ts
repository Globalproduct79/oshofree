import type { CampaignStatus, Country, InvoiceStatus, WorkspaceStatus } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdvertiserPage from '@/app/admin/advertisers/[id]/page'
import {
  approveAction, declineAction, decideCreditAction, markInvoicePaidAction, reapproveAction, updateFactAction,
} from '@/app/admin/advertisers/[id]/actions'
import { closeMonthAction, setCreditLimitAction } from '@/app/admin/advertisers/actions'
import AdvertisersPage from '@/app/admin/advertisers/page'
import { auth } from '@/lib/auth'
import { advertiserDetail, advertiserRows } from '@/lib/advertisers'
import { db } from '@/lib/db'
import { creditSummary, requestCredit } from '@/lib/money'
import { tokens } from '@/lib/tokens'

vi.mock('@/lib/auth', () => ({ auth: vi.fn(), signOut: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// requireAdmin answers a non-admin with notFound(): its digest says 404.
const NOT_FOUND = { digest: expect.stringMatching(/NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK;404/) }
const at = (iso: string) => new Date(iso)
const NOW = at('2026-11-14T09:00:00Z')
const text = (m: string) =>
  m.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1

let seq = 0
const makeUser = (name: string, isGlobalAdmin = false) =>
  db.user.create({ data: { email: `u${++seq}@x.test`, name, passwordHash: 'x', isGlobalAdmin } })
const signIn = (u: { id: string; isGlobalAdmin: boolean }) =>
  vi.mocked(auth).mockResolvedValue({ user: { id: u.id, isGlobalAdmin: u.isGlobalAdmin }, expires: '' } as never)

async function makeWorkspace(
  name: string, country: Country, status: WorkspaceStatus, owner: string | null,
  extra: { creditLimitCents?: number; createdAt?: Date; declineReason?: string } = {},
) {
  const ws = await db.workspace.create({ data: { name, type: 'Brand', country, status, ...extra } })
  const user = owner ? await makeUser(owner) : null
  if (user) await db.workspaceMember.create({ data: { userId: user.id, workspaceId: ws.id, role: 'Owner' } })
  return { ws, owner: user }
}

const makeCampaign = (workspaceId: string, headline: string, status: CampaignStatus, budgetUsd: number) =>
  db.campaign.create({
    data: {
      workspaceId, name: headline, brand: 'Kola', country: 'NG', category: 'Retail', headline, description: 'd',
      placement: 'card', redeemMethod: 'code', budgetUsd, shareRewardLabel: 'x', status,
      startsAt: at('2026-10-01T00:00:00Z'), endsAt: at('2026-12-01T00:00:00Z'),
    },
  })

const makeInvoice = (workspaceId: string, number: string, amountCents: number, status: InvoiceStatus, dueAt: string) =>
  db.invoice.create({
    data: {
      workspaceId, number, period: at('2026-09-30T23:00:00Z'), amountCents, status, fxPerUsd: 1550, country: 'NG',
      issuedAt: at('2026-11-01T06:00:00Z'), dueAt: at(dueAt), paidAt: status === 'paid' ? at('2026-11-05T00:00:00Z') : null,
    },
  })

// Kola Bright (Nigeria, $1,500): a live campaign ($300, $50 delivered and unbilled), an ended one and a draft;
// INV-0052 due ($200), INV-0046 overdue ($10), INV-0041 paid ($100).
// Outstanding = 200 + 10 = $210. In use = 210 + 50 unbilled + (300 − 50) committed = $510.
async function kola() {
  const { ws, owner } = await makeWorkspace('Kola Bright', 'NG', 'approved', 'Tunde Okafor', {
    creditLimitCents: 150_000, createdAt: at('2026-03-10T10:00:00Z'),
  })
  const live = await makeCampaign(ws.id, 'Buy 2 get 1', 'live', 300)
  const ended = await makeCampaign(ws.id, 'Old offer', 'ended', 200)
  await makeCampaign(ws.id, 'Next offer', 'draft', 100)
  const due = await makeInvoice(ws.id, 'INV-0052', 20_000, 'due', '2026-11-15T06:00:00Z')
  const overdue = await makeInvoice(ws.id, 'INV-0046', 1_000, 'due', '2026-11-04T06:00:00Z')
  const paid = await makeInvoice(ws.id, 'INV-0041', 10_000, 'paid', '2026-10-15T06:00:00Z')
  await db.ledgerEntry.createMany({
    data: [
      { workspaceId: ws.id, at: at('2026-10-10T10:00:00Z'), amountCents: -20_000, description: 'Old offer — delivery', kind: 'delivery', campaignId: ended.id, invoiceId: due.id },
      { workspaceId: ws.id, at: at('2026-09-10T10:00:00Z'), amountCents: -1_000, description: 'Old offer — delivery', kind: 'delivery', campaignId: ended.id, invoiceId: overdue.id },
      { workspaceId: ws.id, at: at('2026-11-03T10:00:00Z'), amountCents: -5_000, description: 'Buy 2 get 1 — delivery', kind: 'delivery', campaignId: live.id },
    ],
  })
  return { ws, owner: owner!, live, due, overdue, paid }
}

const global = async () => {
  const g = await makeUser('Global Admin', true)
  signIn(g)
  return g
}

const renderList = async () => renderToStaticMarkup(await AdvertisersPage())
const renderDetail = async (id: string) => renderToStaticMarkup(await AdvertiserPage({ params: Promise.resolve({ id }) }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})
afterEach(() => vi.useRealTimers())

describe('advertiserRows', () => {
  it('lists every workspace with campaigns, credit limit, in use and outstanding from the money module', async () => {
    const { ws } = await kola()
    const pending = await makeWorkspace('SunFresh Juices', 'GH', 'pending', 'Kofi Mensah', { createdAt: at('2026-11-01T00:00:00Z') })
    const declined = await makeWorkspace('Nope Ltd', 'KE', 'declined', null, { createdAt: at('2026-11-02T00:00:00Z') })

    const rows = await advertiserRows()
    expect(rows.map((r) => r.name)).toEqual(['Kola Bright', 'SunFresh Juices', 'Nope Ltd'])
    expect(rows[0]).toEqual({
      id: ws.id, name: 'Kola Bright', demo: false, owner: 'Tunde Okafor', type: 'Brand', country: 'NG', status: 'approved',
      campaigns: 3, live: 1, creditLimitCents: 150_000, inUseCents: 51_000, outstandingCents: 21_000,
    })
    const money = await creditSummary(ws.id)
    expect([rows[0].inUseCents, rows[0].outstandingCents]).toEqual([money.inUseCents, money.outstandingCents])
    expect(rows[1]).toMatchObject({ id: pending.ws.id, owner: 'Kofi Mensah', status: 'pending', campaigns: 0, live: 0, inUseCents: 0, outstandingCents: 0 })
    expect(rows[2]).toMatchObject({ id: declined.ws.id, owner: null, status: 'declined' })
  })
})

describe('Platform › Advertisers', () => {
  it('renders the GLB §2.2 table: headers, campaigns, an editable limit, amber outstanding, Open workspace and Close month', async () => {
    await global()
    const { ws } = await kola()
    await makeWorkspace('SunFresh Juices', 'GH', 'pending', 'Kofi Mensah', { createdAt: at('2026-11-01T00:00:00Z') })
    await makeWorkspace('Nope Ltd', 'KE', 'declined', null, { createdAt: at('2026-11-02T00:00:00Z') })
    const html = await renderList()
    const t = text(html)

    expect(t).toContain('Platform › Advertisers')
    expect(t).toContain('Every workspace on the platform, with credit limits and approval.')
    expect(t).toContain('Close month')
    expect(t).toContain('Workspace Type Country Status Campaigns Credit limit In use Outstanding')
    expect(t).toContain('Kola Bright Tunde Okafor Brand Nigeria Approved 3 (1 live)')
    expect(t).toContain('$510 $210 Open workspace')
    expect(t).toContain('SunFresh Juices Kofi Mensah Brand Ghana Pending approval 0 (0 live)')
    expect(t).toContain('Nope Ltd')
    expect(t).toContain('Declined')
    expect(html).toContain(`href="/admin/advertisers/${ws.id}"`)
    expect(html).toMatch(/type="number"[^>]*step="100"[^>]*min="0"|min="0"[^>]*step="100"/)
    expect(html).toContain('value="1500"')
    expect(html).toContain(`color:${tokens.amber}">$210`)
    expect(html).not.toContain(`color:${tokens.amber}">$0`)
    expect(count(t, 'Open workspace')).toBe(3)
  })

  it('a credit edit refuses negatives and fractions, persists whole dollars, re-renders, tells the owner and audits', async () => {
    const g = await global()
    const { ws, owner } = await kola()

    for (const bad of [-100, 12.5, Number.NaN, '900']) {
      expect(await setCreditLimitAction(ws.id, bad)).toEqual({ error: 'Enter a whole number of dollars, 0 or more.' })
    }
    expect((await db.workspace.findUniqueOrThrow({ where: { id: ws.id } })).creditLimitCents).toBe(150_000)
    expect(await db.notification.count()).toBe(0)

    expect(await setCreditLimitAction(ws.id, 1000)).toEqual({ toast: 'Credit limit updated — owner emailed' })
    expect((await db.workspace.findUniqueOrThrow({ where: { id: ws.id } })).creditLimitCents).toBe(100_000)
    expect(await db.notification.findMany({ select: { userId: true, title: true } })).toEqual([
      { userId: owner.id, title: 'Your credit limit is now $1,000' },
    ])
    expect(await db.auditEvent.findFirst({ where: { action: 'credit.limit' } })).toMatchObject({
      actorId: g.id, workspaceId: ws.id, before: { creditLimitCents: 150_000 }, after: { creditLimitCents: 100_000 },
    })
    expect(revalidatePath).toHaveBeenCalledWith('/admin/advertisers', 'layout')
    expect(await renderList()).toContain('value="1000"')

    // Past what the column holds (2,147,483,647 cents) is refused as a toast, not a crash.
    expect(await setCreditLimitAction(ws.id, 99_999_999)).toEqual({ error: 'That limit is too large.' })
    expect((await db.workspace.findUniqueOrThrow({ where: { id: ws.id } })).creditLimitCents).toBe(100_000)

    // Zero is a limit; an unknown workspace is not.
    expect(await setCreditLimitAction(ws.id, 0)).toEqual({ toast: 'Credit limit updated — owner emailed' })
    expect(await setCreditLimitAction('nope', 100)).toEqual({ error: 'That workspace no longer exists.' })
  })

  it('Close month closes the previous month, is idempotent and maps the refusals', async () => {
    await global()
    const { ws } = await makeWorkspace('Pesa Link', 'KE', 'approved', 'Wanjiru Kamau')
    await db.ledgerEntry.create({ data: { workspaceId: ws.id, at: at('2026-10-15T10:00:00Z'), amountCents: -9_000, description: 'x — delivery', kind: 'delivery' } })

    expect(await closeMonthAction()).toEqual({ error: 'Set an exchange rate for every market first.' })
    expect(await db.invoice.count()).toBe(0)

    await db.marketFx.create({ data: { country: 'KE', fxPerUsd: 129, effectiveFrom: at('2026-09-01T00:00:00Z') } })
    expect(await closeMonthAction()).toEqual({ toast: 'Month closed — 1 invoice issued' })
    const [inv] = await db.invoice.findMany()
    expect(inv).toMatchObject({ workspaceId: ws.id, period: at('2026-09-30T21:00:00Z'), amountCents: 9_000, status: 'due' })
    expect(await closeMonthAction()).toEqual({ toast: 'Month closed — 0 invoices issued' })
    expect(await db.invoice.count()).toBe(1)
    expect(await db.auditEvent.count({ where: { action: 'month.close' } })).toBe(2)

    // 22:00 UTC on 31 Oct: November in Nairobi, still October in Lagos and Accra.
    vi.setSystemTime(at('2026-10-31T22:00:00Z'))
    expect(await closeMonthAction()).toEqual({ error: "The month isn't over in every market yet." })
  })
})

describe('Platform › Advertisers › workspace', () => {
  it('names who created each campaign on its card; one from before creators were recorded names no one', async () => {
    await global()
    const { ws, owner, live } = await kola()
    const ada = await makeUser('Ada Eze')
    await db.workspaceMember.create({ data: { userId: ada.id, workspaceId: ws.id, role: 'Manager' } })
    await db.campaign.update({ where: { id: live.id }, data: { createdById: owner.id } })
    const byAda = await makeCampaign(ws.id, 'Ada offer', 'review', 100)
    await db.campaign.update({ where: { id: byAda.id }, data: { createdById: ada.id } })
    const d = await advertiserDetail(ws.id, NOW)
    expect(Object.fromEntries(d!.cards.map((c) => [c.headline, c.createdBy]))).toEqual({
      'Buy 2 get 1': 'Tunde Okafor', 'Ada offer': 'Ada Eze', 'Old offer': undefined, 'Next offer': undefined,
    })
    const cards = (await renderDetail(ws.id)).split('class="cc"').slice(1).map(text)
    expect(cards.find((c) => c.includes('Buy 2 get 1'))).toContain('Kola · Nigeria · 17d left Created by Tunde Okafor')
    expect(cards.find((c) => c.includes('Ada offer'))).toContain('Kola · Nigeria Created by Ada Eze')
    expect(cards.find((c) => c.includes('Next offer'))).not.toContain('Created by')
  })

  it('heads with the name and the facts line, and shows facts, campaigns, invoices, requests and history', async () => {
    await global()
    const { ws, live } = await kola()
    const html = await renderDetail(ws.id)
    const t = text(html)
    expect(t).toContain('Platform › Advertisers › Kola Bright')
    expect(t).toContain('Brand · Nigeria · owner Tunde Okafor · since Mar 2026')
    for (const box of ['Facts', 'Campaigns', 'Invoices', 'Credit requests', 'History']) expect(t).toContain(box)
    expect(t).toContain('Terms Net 14')
    expect(t).toContain('Account manager')
    // Approved straight in the database, so nobody is named yet: the field is empty for Global to fill.
    expect(html).toMatch(/aria-label="Account manager"[^>]*value=""/)
    expect(html).toContain('value="1500"')
    expect(t).toContain('Buy 2 get 1')
    expect(t).toContain('Next offer')
    // A card's own address is this Platform page (entering is the click's action, landing on /app/campaigns/{id}), so
    // one opened in a new tab never lands in the wrong workspace (Prompt 10).
    expect(html).toContain(`<a class="cc" href="/admin/advertisers/${ws.id}">`)
    expect(html).not.toContain(`href="/app/campaigns/${live.id}"`)
    expect(t).toContain('No requests.')
    expect(t).toContain('No history yet.')
  })

  it('an unknown workspace is a 404', async () => {
    await global()
    await expect(renderDetail('nope')).rejects.toMatchObject(NOT_FOUND)
  })

  it('lists invoices with Mark paid on the due and overdue ones; marking posts the payment line once', async () => {
    const g = await global()
    const { ws, due } = await kola()
    let t = text(await renderDetail(ws.id))
    expect(t).toContain('Invoice Period Status Due USD NGN')
    expect(t).toContain('INV-0052 Oct 2026 Due 15 Nov $200 ₦310,000 Mark paid')
    expect(t).toContain('INV-0046 Oct 2026 Overdue 4 Nov $10 ₦15,500 Mark paid')
    expect(t).toContain('INV-0041 Oct 2026 Paid — $100 ₦155,000')
    expect(count(t, 'Mark paid')).toBe(2)

    expect(await markInvoicePaidAction(due.id)).toEqual({ toast: 'INV-0052 marked paid — credit released' })
    expect(await markInvoicePaidAction(due.id)).toEqual({ toast: 'INV-0052 marked paid — credit released' })
    expect(await db.ledgerEntry.findMany({ where: { invoiceId: due.id, kind: 'payment' }, select: { amountCents: true } })).toEqual([
      { amountCents: 20_000 },
    ])
    expect(await db.auditEvent.count({ where: { action: 'invoice.paid', actorId: g.id } })).toBe(1)
    expect((await creditSummary(ws.id)).outstandingCents).toBe(1_000)
    t = text(await renderDetail(ws.id))
    expect(count(t, 'Mark paid')).toBe(1)
    expect(await markInvoicePaidAction('nope')).toEqual({ error: 'That invoice no longer exists.' })
  })

  it('an invoice issued under Nigeria keeps its naira after Global moves the workspace to Kenya', async () => {
    await global()
    const { ws } = await kola()
    expect(await updateFactAction(ws.id, 'country', 'KE')).toHaveProperty('toast')
    const d = await advertiserDetail(ws.id, NOW)
    expect(d!.invoices.map((i) => [i.number, i.country, i.local])).toEqual([
      ['INV-0052', 'NG', '₦310,000'], ['INV-0046', 'NG', '₦15,500'], ['INV-0041', 'NG', '₦155,000'],
    ])
    const t = text(await renderDetail(ws.id))
    expect(t).toContain('INV-0052 Oct 2026 Due 15 Nov $200 ₦310,000 Mark paid')
    expect(t).not.toContain('KSh310,000')
  })

  it('an empty invoice list says "Nothing outstanding."', async () => {
    await global()
    const { ws } = await makeWorkspace('Pesa Link', 'KE', 'approved', 'Wanjiru Kamau')
    expect(text(await renderDetail(ws.id))).toContain('Nothing outstanding.')
  })

  it('open credit requests: Approve sets the limit and tells the owner; Dismiss leaves it', async () => {
    await global()
    const { ws, owner } = await kola()
    const first = await requestCredit(ws.id, owner.id, 'Q4 push')
    await db.creditRequest.update({ where: { id: first.id }, data: { createdAt: NOW } })
    const t = text(await renderDetail(ws.id))
    expect(t).toContain('Tunde Okafor Q4 push 14 Nov')
    expect(t).toContain('Approve Dismiss')

    expect(await decideCreditAction(first.id, 'approved', -5)).toEqual({ error: 'Enter a whole number of dollars, 0 or more.' })
    expect(await decideCreditAction(first.id, 'approved', 99_999_999)).toEqual({ error: 'That limit is too large.' })
    expect(await decideCreditAction(first.id, 'maybe', 2000)).toEqual({ error: 'Someone already decided this. Reload to see where it stands.' })
    expect((await db.creditRequest.findUniqueOrThrow({ where: { id: first.id } })).status).toBe('open')

    expect(await decideCreditAction(first.id, 'approved', 2000)).toEqual({ toast: 'Credit limit updated — owner emailed' })
    expect((await db.workspace.findUniqueOrThrow({ where: { id: ws.id } })).creditLimitCents).toBe(200_000)
    expect((await db.creditRequest.findUniqueOrThrow({ where: { id: first.id } })).status).toBe('approved')
    expect(await db.notification.count({ where: { userId: owner.id, title: 'Your credit limit is now $2,000' } })).toBe(1)
    expect(await decideCreditAction(first.id, 'dismissed')).toEqual({ error: 'Someone already decided this. Reload to see where it stands.' })

    const second = await requestCredit(ws.id, owner.id)
    expect(await decideCreditAction(second.id, 'dismissed')).toEqual({ toast: 'Request dismissed' })
    expect((await db.workspace.findUniqueOrThrow({ where: { id: ws.id } })).creditLimitCents).toBe(200_000)
    const decided = await db.auditEvent.findMany({ where: { action: 'credit.decide' }, select: { targetId: true, after: true } })
    expect(decided).toHaveLength(2)
    expect(decided).toEqual(expect.arrayContaining([
      { targetId: first.id, after: { status: 'approved' } }, { targetId: second.id, after: { status: 'dismissed' } },
    ]))
    expect(text(await renderDetail(ws.id))).toContain('No requests.')
  })

  it('Global changes an approved workspace\'s type, billing country, registration and account manager, each audited', async () => {
    const g = await global()
    const { ws } = await kola()
    expect(await updateFactAction(ws.id, 'country', 'KE')).toEqual({ toast: 'Billing country updated — it applies from the next invoice' })
    expect(await updateFactAction(ws.id, 'type', 'Agency')).toEqual({ toast: 'Type updated' })
    expect(await updateFactAction(ws.id, 'registrationNumber', '  RC-1234  ')).toEqual({ toast: 'Registration number updated' })
    expect(await updateFactAction(ws.id, 'accountManager', 'Ada E.')).toEqual({ toast: 'Account manager updated' })
    expect(await db.workspace.findUniqueOrThrow({ where: { id: ws.id } })).toMatchObject({
      country: 'KE', type: 'Agency', registrationNumber: 'RC-1234', accountManager: 'Ada E.',
    })
    const updates = await db.auditEvent.findMany({ where: { action: 'workspace.update', actorId: g.id, workspaceId: ws.id }, select: { before: true, after: true } })
    expect(updates).toHaveLength(4)
    expect(updates).toEqual(expect.arrayContaining([
      { before: { country: 'NG' }, after: { country: 'KE' } },
      { before: { type: 'Brand' }, after: { type: 'Agency' } },
      { before: { registrationNumber: null }, after: { registrationNumber: 'RC-1234' } },
      { before: { accountManager: null }, after: { accountManager: 'Ada E.' } },
    ]))

    for (const [field, value] of [['country', 'XX'], ['type', 'Shop'], ['accountManager', '  '], ['name', 'Hacked'], ['registrationNumber', 'x'.repeat(41)]]) {
      expect(await updateFactAction(ws.id, field, value)).toHaveProperty('error')
    }
    expect(text(await renderDetail(ws.id))).toContain('Agency · Kenya · owner Tunde Okafor')
  })

  it('approves or declines a pending workspace and re-approves a declined one', async () => {
    const g = await global()
    const { ws: a, owner } = await makeWorkspace('SunFresh Juices', 'GH', 'pending', 'Kofi Mensah')
    const { ws: b } = await makeWorkspace('Nope Ltd', 'KE', 'pending', null)
    let t = text(await renderDetail(a.id))
    expect(t).toContain('Pending approval Approve Decline')
    expect(t).not.toContain('Re-approve')

    expect(await approveAction(a.id)).toEqual({ toast: 'SunFresh Juices approved — owner emailed' })
    expect(await approveAction(a.id)).toEqual({ error: 'Someone already decided this. Reload to see where it stands.' })
    expect(await db.notification.count({ where: { userId: owner!.id } })).toBe(1)
    const approved = await renderDetail(a.id)
    for (const button of ['Approve', 'Decline', 'Re-approve']) expect(approved).not.toContain(`>${button}</button>`)

    expect(await declineAction(b.id, '  ')).toEqual({ error: 'Give a reason so the advertiser knows what to fix.' })
    expect(await declineAction(b.id, 'Not a registered business')).toEqual({ toast: 'Nope Ltd declined' })
    t = text(await renderDetail(b.id))
    expect(t).toContain('Declined Not a registered business Re-approve')

    expect(await reapproveAction(a.id)).toEqual({ error: 'Someone already decided this. Reload to see where it stands.' })
    expect(await reapproveAction(b.id)).toEqual({ toast: 'Nope Ltd approved — owner emailed' })
    expect(await db.workspace.findUniqueOrThrow({ where: { id: b.id } })).toMatchObject({ status: 'approved', declineReason: null, approvedAt: NOW })
    const trail = await db.auditEvent.findMany({ where: { targetId: b.id, actorId: g.id }, select: { action: true, before: true, after: true } })
    expect(trail).toHaveLength(2)
    expect(trail).toEqual(expect.arrayContaining([
      { action: 'workspace.decline', before: { status: 'pending' }, after: { status: 'declined', declineReason: 'Not a registered business' } },
      { action: 'workspace.approve', before: { status: 'declined' }, after: { status: 'approved' } },
    ]))
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('the history is the workspace\'s audit trail, newest first, 50 rows, with the actor or "System"', async () => {
    const g = await global()
    const { ws, due, live } = await kola()
    const other = await makeWorkspace('Pesa Link', 'KE', 'approved', null)
    const row = (action: string, iso: string, extra: object = {}) => ({
      action, targetType: 'Workspace', targetId: ws.id, workspaceId: ws.id, at: at(iso), actorId: g.id, ...extra,
    })
    await db.auditEvent.createMany({
      data: [
        row('workspace.approve', '2026-03-11T10:00:00Z', { before: { status: 'pending' }, after: { status: 'approved' } }),
        row('credit.limit', '2026-11-10T10:00:00Z', { before: { creditLimitCents: 50_000 }, after: { creditLimitCents: 150_000 } }),
        row('workspace.update', '2026-11-11T10:00:00Z', { before: { country: 'GH' }, after: { country: 'NG' } }),
        row('invoice.paid', '2026-11-12T10:00:00Z', { targetType: 'Invoice', targetId: due.id, actorId: null, before: { status: 'due' }, after: { status: 'paid' } }),
        { ...row('workspace.enter', '2026-11-13T10:00:00Z'), targetId: other.ws.id, workspaceId: other.ws.id },
      ],
    })
    // A Kenyan campaign of this Nigerian workspace: its reward reads in shillings, a Nigerian one's in naira.
    const ke = await db.campaign.update({ where: { id: (await makeCampaign(ws.id, 'Nairobi offer', 'live', 100)).id }, data: { country: 'KE' } })
    await db.auditEvent.createMany({
      data: [
        { ...row('rewards.reward', '2026-11-09T10:00:00Z', { before: { rewardLocal: 10 }, after: { rewardLocal: 20 } }), targetType: 'Campaign', targetId: ke.id },
        { ...row('rewards.reward', '2026-11-08T10:00:00Z', { before: { rewardLocal: 50 }, after: { rewardLocal: 80 } }), targetType: 'Campaign', targetId: live.id },
      ],
    })
    const t = text(await renderDetail(ws.id))
    expect(t).toContain('9 Nov Global Admin Share reward changed KSh10 → KSh20')
    expect(t).toContain('8 Nov Global Admin Share reward changed ₦50 → ₦80')
    expect(t).toContain('Date By Action Change')
    const lines = [
      '12 Nov System Invoice marked paid INV-0052 · Due → Paid',
      '11 Nov Global Admin Settings changed Ghana → Nigeria',
      '10 Nov Global Admin Credit limit changed $500 → $1,500',
      '11 Mar Global Admin Workspace approved Pending approval → Approved',
    ]
    for (const l of lines) expect(t).toContain(l)
    expect(lines.map((l) => t.indexOf(l))).toEqual([...lines.map((l) => t.indexOf(l))].sort((x, y) => x - y))
    expect(t).not.toContain('Global entered the workspace')

    await db.auditEvent.createMany({
      data: Array.from({ length: 50 }, (_, i) => row('workspace.enter', `2026-11-0${1 + (i % 9)}T10:00:00Z`)),
    })
    const d = await advertiserDetail(ws.id, NOW)
    expect(d!.history).toHaveLength(50)
    expect(d!.history[0].action).toBe('Invoice marked paid')
  })

  it('refuses a non-admin on both pages and every action, changing nothing', async () => {
    const { ws, owner, due } = await kola()
    const req = await requestCredit(ws.id, owner.id)
    signIn(owner)
    await expect(renderList()).rejects.toMatchObject(NOT_FOUND)
    await expect(renderDetail(ws.id)).rejects.toMatchObject(NOT_FOUND)
    const calls = [
      () => setCreditLimitAction(ws.id, 9000),
      () => closeMonthAction(),
      () => markInvoicePaidAction(due.id),
      () => decideCreditAction(req.id, 'approved', 9000),
      () => updateFactAction(ws.id, 'country', 'KE'),
      () => approveAction(ws.id),
      () => declineAction(ws.id, 'No'),
      () => reapproveAction(ws.id),
    ]
    for (const call of calls) await expect(call()).rejects.toMatchObject(NOT_FOUND)
    expect(await db.workspace.findUniqueOrThrow({ where: { id: ws.id } })).toMatchObject({ creditLimitCents: 150_000, country: 'NG', status: 'approved' })
    expect((await db.invoice.findUniqueOrThrow({ where: { id: due.id } })).status).toBe('due')
    expect((await db.creditRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe('open')
    expect(await db.auditEvent.count()).toBe(0)
  })
})
