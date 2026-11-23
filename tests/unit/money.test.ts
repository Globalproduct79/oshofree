import { describe, expect, it } from 'vitest'
import type { CampaignStatus, Country, InvoiceStatus, LedgerKind } from '@prisma/client'
import { db } from '@/lib/db'
import { MONEY, periodLabel } from '@/lib/copy-money'
import {
  availableCents,
  campaignSpendCents,
  canSubmitBudget,
  closeMonth,
  committedCents,
  creditInUseCents,
  creditSummary,
  decideCredit,
  invoiceStatus,
  limitFromDollars,
  markInvoicePaid,
  MAX_LIMIT_CENTS,
  monthBounds,
  nextInvoiceNumber,
  outstandingCents,
  postLedger,
  requestCredit,
  setCreditLimit,
  statement,
  statementMonths,
  unbilledCents,
} from '@/lib/money'

const DAY = 86_400_000
const at = (iso: string) => new Date(iso)
const NOW = at('2026-11-14T09:00:00Z')

// Local month starts as UTC instants: Lagos is UTC+1, Nairobi UTC+3, Accra UTC+0.
const KE_OCT = at('2026-09-30T21:00:00Z')
const KE_NOV = at('2026-10-31T21:00:00Z')
const NG_OCT = at('2026-09-30T23:00:00Z')
const NG_NOV = at('2026-10-31T23:00:00Z')

let users = 0
const makeUser = (isGlobalAdmin = false) =>
  db.user.create({ data: { email: `u${++users}@x.test`, name: 'U', passwordHash: 'x', isGlobalAdmin } })

const makeWorkspace = (name: string, country: Country, extra: { creditLimitCents?: number; termsDays?: number } = {}) =>
  db.workspace.create({ data: { name, type: 'Brand', country, status: 'approved', ...extra } })

const makeCampaign = (workspaceId: string, name: string, status: CampaignStatus, budgetUsd: number) =>
  db.campaign.create({
    data: {
      workspaceId, name, brand: 'B', country: 'KE', category: 'Retail', headline: name, description: 'd',
      placement: 'card', redeemMethod: 'code', budgetUsd, shareRewardLabel: 'x', status,
      startsAt: at('2026-10-01T00:00:00Z'), endsAt: at('2026-12-01T00:00:00Z'),
    },
  })

const line = (
  workspaceId: string, iso: string, amountCents: number, description: string,
  extra: { kind?: LedgerKind; campaignId?: string; invoiceId?: string } = {},
) => db.ledgerEntry.create({ data: { workspaceId, at: at(iso), amountCents, description, kind: extra.kind ?? 'delivery', ...extra } })

const makeInvoice = async (
  workspaceId: string, number: string, period: Date, amountCents: number, status: InvoiceStatus,
  dates: { issuedAt: string; dueAt: string; paidAt?: string },
) =>
  db.invoice.create({
    data: {
      workspaceId, number, period, amountCents, status, fxPerUsd: 129,
      country: (await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } })).country,
      issuedAt: at(dates.issuedAt), dueAt: at(dates.dueAt), paidAt: dates.paidAt ? at(dates.paidAt) : null,
    },
  })

// The brief's fixture, on a Kenyan workspace (Nairobi is UTC+3).
// Limit $1,500. Live campaign: budget $300, spend $133. Review campaign: $400. Overdue invoice: $210.
// Unbilled: −$135. Ended, rejected and draft campaigns carry budgets that must not count.
async function briefFixture() {
  const user = await makeUser()
  const ws = await makeWorkspace('Pesa Link', 'KE', { creditLimitCents: 150000 })
  const live = await makeCampaign(ws.id, 'Send money free', 'live', 300)
  const review = await makeCampaign(ws.id, 'Weekend data', 'review', 400)
  const ended = await makeCampaign(ws.id, 'Back to school', 'ended', 500)
  await makeCampaign(ws.id, 'Jackpot week', 'rejected', 250)
  await makeCampaign(ws.id, 'December idea', 'draft', 1000)

  const septInvoice = await makeInvoice(ws.id, 'INV-0041', at('2026-08-31T21:00:00Z'), 50000, 'paid', {
    issuedAt: '2026-10-01T06:00:00Z', dueAt: '2026-10-15T06:00:00Z', paidAt: '2026-10-01T08:00:00Z',
  })
  const overdue = await makeInvoice(ws.id, 'INV-0046', KE_OCT, 21000, 'due', {
    issuedAt: '2026-11-01T06:00:00Z', dueAt: '2026-11-04T00:00:00Z',
  })

  // The September payment: not a charge, counts nowhere.
  await line(ws.id, '2026-10-01T08:00:00Z', 50000, 'INV-0041 paid', { kind: 'payment', invoiceId: septInvoice.id })
  // October, invoiced on INV-0046 ($100 + $110 = $210).
  await line(ws.id, '2026-10-20T09:00:00Z', -10000, MONEY.deliveryLine(live.name), { campaignId: live.id, invoiceId: overdue.id })
  await line(ws.id, '2026-10-25T09:00:00Z', -11000, MONEY.deliveryLine(ended.name), { campaignId: ended.id, invoiceId: overdue.id })
  // November (Nairobi): $28 + $5 + $102 = $135 unbilled. 22:30 UTC on 31 Oct is 01:30 on 1 Nov in Nairobi.
  await line(ws.id, '2026-11-03T08:00:00Z', -2800, MONEY.deliveryLine(live.name), { campaignId: live.id })
  await line(ws.id, '2026-11-03T08:00:00Z', -500, MONEY.rewardsLine(live.name), { kind: 'reward', campaignId: live.id })
  await line(ws.id, '2026-10-31T22:30:00Z', -10200, MONEY.deliveryLine(ended.name), { campaignId: ended.id })

  return { user, ws, live, review, ended, overdue }
}

describe('credit in use (the brief fixture)', () => {
  it('is outstanding + unbilled + committed; ended, rejected and draft campaigns are excluded', async () => {
    const { ws, live, review } = await briefFixture()
    // Live spend = $100 (invoiced) + $28 + $5 (unbilled) = $133.
    expect(await campaignSpendCents(live.id)).toBe(13300)
    expect(await campaignSpendCents(review.id)).toBe(0)
    expect(await outstandingCents(ws.id)).toBe(21000)
    expect(await unbilledCents(ws.id)).toBe(13500)
    // Review $400 + live ($300 − $133 = $167).
    expect(await committedCents(ws.id)).toBe(56700)
    // 21000 + 40000 + 16700 + 13500
    expect(await creditInUseCents(ws.id)).toBe(91200)
    expect(await availableCents(ws.id)).toBe(58800)
    expect(await creditSummary(ws.id)).toEqual({
      limitCents: 150000,
      inUseCents: 91200,
      availableCents: 58800,
      unbilledCents: 13500,
      outstandingCents: 21000,
      committedCents: 56700,
      nearLimit: false,
      overLimit: false,
    })
  })

  it('scheduled and paused campaigns count; a campaign spent past its budget counts 0', async () => {
    const ws = await makeWorkspace('Kola Bright', 'NG')
    await makeCampaign(ws.id, 'Live', 'live', 100)
    await makeCampaign(ws.id, 'Scheduled', 'scheduled', 50)
    const paused = await makeCampaign(ws.id, 'Paused', 'paused', 70)
    await makeCampaign(ws.id, 'Review', 'review', 30)
    const over = await makeCampaign(ws.id, 'Overspent', 'live', 50)
    for (const s of ['draft', 'rejected', 'ended'] as const) await makeCampaign(ws.id, s, s, 999)
    await line(ws.id, '2026-11-02T10:00:00Z', -2000, 'Paused — delivery', { campaignId: paused.id })
    await line(ws.id, '2026-11-02T10:00:00Z', -6000, 'Overspent — delivery', { campaignId: over.id })
    // 10000 + 5000 + (7000 − 2000) + 3000 + max(0, 5000 − 6000)
    expect(await committedCents(ws.id)).toBe(23000)
  })

  it('near the limit above 85 %, over the limit above 100 %, available floors at 0', async () => {
    const { ws } = await briefFixture()
    await db.workspace.update({ where: { id: ws.id }, data: { creditLimitCents: 100000 } })
    // 91200 > 85000, 91200 ≤ 100000
    expect(await creditSummary(ws.id)).toMatchObject({ availableCents: 8800, nearLimit: true, overLimit: false })
    await db.workspace.update({ where: { id: ws.id }, data: { creditLimitCents: 90000 } })
    expect(await creditSummary(ws.id)).toMatchObject({ availableCents: 0, nearLimit: true, overLimit: true })
  })

  it('markInvoicePaid releases credit and posts the payment line once', async () => {
    const { user, ws, overdue } = await briefFixture()
    const paid = await markInvoicePaid(overdue.id, user.id, NOW)
    expect(paid).toMatchObject({ status: 'paid', paidAt: NOW })
    expect(await outstandingCents(ws.id)).toBe(0)
    expect(await unbilledCents(ws.id)).toBe(13500)
    // 91200 − 21000
    expect(await creditInUseCents(ws.id)).toBe(70200)
    expect(await availableCents(ws.id)).toBe(79800)

    const again = await markInvoicePaid(overdue.id, user.id, at('2026-11-15T09:00:00Z'))
    expect(again).toMatchObject({ status: 'paid', paidAt: NOW })
    const payments = await db.ledgerEntry.findMany({ where: { invoiceId: overdue.id, kind: 'payment' } })
    expect(payments).toHaveLength(1)
    expect(payments[0]).toMatchObject({
      workspaceId: ws.id, at: NOW, description: 'INV-0046 paid', amountCents: 21000, dedupeKey: `payment:${overdue.id}`,
    })
    expect(await db.auditEvent.count({ where: { action: 'invoice.paid', targetId: overdue.id } })).toBe(1)
    const [top] = await statement(ws.id, NOW)
    expect(top).toMatchObject({ description: 'INV-0046 paid', amountCents: 21000, kind: 'payment', isPayment: true })
  })

  it('canSubmitBudget: the excess is what the budget (or the increase) takes past the limit', async () => {
    const { ws } = await briefFixture()
    // 91200 + 60000 − 150000
    expect(await canSubmitBudget(ws.id, 60000)).toEqual({ ok: false, excessCents: 1200, limitCents: 150000 })
    expect(MONEY.overCredit(150000, 1200)).toBe(
      'Over your credit limit of $1,500 by $12. Pay an open invoice or ask Global to raise it.',
    )
    // Exactly at the limit is allowed.
    expect(await canSubmitBudget(ws.id, 58800)).toEqual({ ok: true, excessCents: 0, limitCents: 150000 })
    // Editing a $900 budget up from $700: only the $200 increase is new.
    expect(await canSubmitBudget(ws.id, 90000, 20000)).toEqual({ ok: true, excessCents: 0, limitCents: 150000 })
  })
})

describe('invoiceStatus', () => {
  const inv = (status: InvoiceStatus, dueAt: string) => ({ status, dueAt: at(dueAt) })
  it('is overdue when due and dueAt has passed', () => {
    expect(invoiceStatus(inv('due', '2026-11-04T00:00:00Z'), NOW)).toBe('overdue')
    expect(invoiceStatus(inv('due', '2026-11-18T00:00:00Z'), NOW)).toBe('due')
    expect(invoiceStatus(inv('due', NOW.toISOString()), NOW)).toBe('due')
    expect(invoiceStatus(inv('paid', '2026-11-04T00:00:00Z'), NOW)).toBe('paid')
    expect(invoiceStatus(inv('open', '2026-12-06T00:00:00Z'), NOW)).toBe('open')
  })
})

describe('monthBounds', () => {
  it('is the calendar month in the market time zone, as UTC instants', () => {
    expect(monthBounds('NG', NOW)).toEqual({ start: at('2026-10-31T23:00:00Z'), end: at('2026-11-30T23:00:00Z') })
    expect(monthBounds('KE', NOW)).toEqual({ start: KE_NOV, end: at('2026-11-30T21:00:00Z') })
    expect(monthBounds('GH', NOW)).toEqual({ start: at('2026-11-01T00:00:00Z'), end: at('2026-12-01T00:00:00Z') })
  })

  it('22:30 UTC on 31 Oct is still October in Lagos (23:30) but November in Nairobi (01:30)', () => {
    const t = at('2026-10-31T22:30:00Z')
    expect(monthBounds('NG', t)).toEqual({ start: NG_OCT, end: at('2026-10-31T23:00:00Z') })
    expect(monthBounds('KE', t).start).toEqual(KE_NOV)
  })

  it('rolls over the year', () => {
    expect(monthBounds('NG', at('2026-12-31T22:59:00Z'))).toEqual({
      start: at('2026-11-30T23:00:00Z'), end: at('2026-12-31T23:00:00Z'),
    })
    expect(monthBounds('NG', at('2026-12-31T23:00:00Z'))).toEqual({
      start: at('2026-12-31T23:00:00Z'), end: at('2027-01-31T23:00:00Z'),
    })
  })

  it('reading a stored period gives back its own month', () => {
    expect(monthBounds('KE', KE_OCT)).toEqual({ start: KE_OCT, end: KE_NOV })
  })
})

describe('closeMonth', () => {
  const CLOSED_AT = at('2026-11-01T06:00:00Z')

  async function closeFixture() {
    const user = await makeUser(true)
    const channel = await db.channel.create({ data: { key: 'phoenix', name: 'Phoenix Browser', apiKeyHash: 'x' } })
    await db.marketFx.createMany({
      data: [
        { country: 'NG', fxPerUsd: 1550, effectiveFrom: at('2026-09-01T00:00:00Z') },
        { country: 'NG', fxPerUsd: 1600, effectiveFrom: at('2026-11-05T00:00:00Z') }, // after October: ignored
        { country: 'KE', fxPerUsd: 129, effectiveFrom: at('2026-09-01T00:00:00Z') },
      ],
    })
    // A share set after October ends does not apply to October: 0.55 (the default) does.
    await db.channelShare.create({ data: { channelId: channel.id, share: 0.6, effectiveFrom: at('2026-11-10T00:00:00Z') } })

    const kola = await makeWorkspace('Kola Bright', 'NG')
    const pesa = await makeWorkspace('Pesa Link', 'KE', { termsDays: 7 })
    const sunfresh = await makeWorkspace('SunFresh', 'GH') // no GH FX: fine, it has nothing in October
    await makeInvoice(kola.id, 'INV-0041', at('2026-08-31T23:00:00Z'), 112000, 'paid', {
      issuedAt: '2026-09-01T06:00:00Z', dueAt: '2026-09-15T06:00:00Z', paidAt: '2026-10-01T08:00:00Z',
    })

    // Kola (Lagos, UTC+1): October = 11800 + 1700 + 1000 = 14500, of which delivery 12800.
    await line(kola.id, '2026-10-02T10:00:00Z', 5000, 'INV-0041 paid', { kind: 'payment' })
    await line(kola.id, '2026-10-03T10:00:00Z', -11800, 'Buy 2 get 1 — delivery')
    await line(kola.id, '2026-10-03T10:00:00Z', -1700, 'Buy 2 get 1 — share rewards', { kind: 'reward' })
    await line(kola.id, '2026-10-31T22:30:00Z', -1000, 'Buy 2 get 1 — delivery') // 23:30 Lagos: October
    await line(kola.id, '2026-11-02T10:00:00Z', -2000, 'Buy 2 get 1 — delivery')
    // Pesa (Nairobi, UTC+3): October = 300 + 9000 = 9300, all delivery.
    await line(pesa.id, '2026-09-30T21:30:00Z', -300, 'Send money free — delivery') // 00:30 1 Oct Nairobi
    await line(pesa.id, '2026-10-15T10:00:00Z', -9000, 'Send money free — delivery')
    await line(pesa.id, '2026-10-31T22:30:00Z', -700, 'Send money free — delivery') // 01:30 1 Nov Nairobi
    // SunFresh (Accra, UTC+0): November only.
    await line(sunfresh.id, '2026-11-01T00:30:00Z', -400, 'Fresh start — delivery')

    return { user, channel, kola, pesa, sunfresh }
  }

  it('invoices each workspace for its own local month, links the rows and writes the Phoenix statement', async () => {
    const { user, channel, kola, pesa, sunfresh } = await closeFixture()
    expect(await unbilledCents(pesa.id)).toBe(10000)

    const { invoices, statements } = await closeMonth(at('2026-10-01T00:00:00Z'), user.id, CLOSED_AT)

    expect(invoices).toHaveLength(2)
    const kolaInv = invoices.find((i) => i.workspaceId === kola.id)!
    const pesaInv = invoices.find((i) => i.workspaceId === pesa.id)!
    expect(kolaInv).toMatchObject({
      number: 'INV-0052', period: NG_OCT, amountCents: 14500, status: 'due', country: 'NG',
      // Terms run from the 1st in the market (Lagos midnight), not from the hour the close ran: due 15 Nov.
      issuedAt: CLOSED_AT, dueAt: new Date(at('2026-10-31T23:00:00Z').getTime() + 14 * DAY),
    })
    expect(Number(kolaInv.fxPerUsd)).toBe(1550)
    expect(pesaInv).toMatchObject({
      number: 'INV-0053', period: KE_OCT, amountCents: 9300, status: 'due', country: 'KE',
      dueAt: new Date(at('2026-10-31T21:00:00Z').getTime() + 7 * DAY), // Nairobi midnight on 1 Nov + 7 days
    })
    expect(Number(pesaInv.fxPerUsd)).toBe(129)

    const linked = async (invoiceId: string) =>
      (await db.ledgerEntry.findMany({ where: { invoiceId }, orderBy: { amountCents: 'asc' } })).map((r) => r.amountCents)
    expect(await linked(kolaInv.id)).toEqual([-11800, -1700, -1000])
    expect(await linked(pesaInv.id)).toEqual([-9000, -300])
    expect(await db.invoice.count({ where: { workspaceId: sunfresh.id } })).toBe(0)

    // Unbilled is now November only.
    expect(await unbilledCents(kola.id)).toBe(2000)
    expect(await unbilledCents(pesa.id)).toBe(700)
    expect(await unbilledCents(sunfresh.id)).toBe(400)
    expect(await outstandingCents(kola.id)).toBe(14500)

    // (12800 + 9300) × 0.55 = 12155
    expect(statements).toHaveLength(1)
    expect(statements[0]).toMatchObject({
      channelId: channel.id, period: at('2026-10-01T00:00:00Z'), amountCents: 12155, status: 'open',
    })
    expect(await db.auditEvent.count({ where: { action: 'invoice.issue' } })).toBe(2)
  })

  it("a close on the 2nd keeps the 1st's due date; one weeks late gives the full terms from its own issue", async () => {
    const { user, kola } = await closeFixture()
    const second = at('2026-11-02T02:00:00Z')
    const [inv] = (await closeMonth(at('2026-10-01T00:00:00Z'), user.id, second)).invoices.filter((i) => i.workspaceId === kola.id)
    expect(inv).toMatchObject({ issuedAt: second, dueAt: new Date(at('2026-10-31T23:00:00Z').getTime() + 14 * DAY) })

    await line(kola.id, '2026-11-02T10:00:00Z', -100, 'Late — delivery')
    // SunFresh has November charges too, so Ghana needs a rate for November to close.
    await db.marketFx.create({ data: { country: 'GH', fxPerUsd: 15.5, effectiveFrom: at('2026-09-01T00:00:00Z') } })
    const late = at('2026-12-20T09:00:00Z')
    const [nov] = (await closeMonth(at('2026-11-01T00:00:00Z'), user.id, late)).invoices.filter((i) => i.workspaceId === kola.id)
    expect(nov).toMatchObject({ issuedAt: late, dueAt: new Date(late.getTime() + 14 * DAY) })
  })

  it('run twice: one invoice per workspace and one statement', async () => {
    const { user } = await closeFixture()
    const first = await closeMonth(at('2026-10-01T00:00:00Z'), user.id, CLOSED_AT)
    // A stored period (Lagos's first local midnight, 23:00 UTC on 30 Sep) names October too.
    const second = await closeMonth(NG_OCT, user.id, at('2026-11-02T06:00:00Z'))
    expect(second.invoices).toEqual([])
    expect(second.statements.map((s) => s.id)).toEqual(first.statements.map((s) => s.id))
    expect(await db.invoice.count({ where: { number: { not: 'INV-0041' } } })).toBe(2)
    expect(await db.settlementStatement.count()).toBe(1)
    expect(await db.auditEvent.count({ where: { action: 'invoice.issue' } })).toBe(2)
  })

  it("a rate or share stamped at the next month's first instant belongs to the next month", async () => {
    const { user, channel } = await closeFixture()
    // Lagos's and Nairobi's first local midnight of November, and the statement's month end (1 Nov 00:00 UTC).
    await db.marketFx.create({ data: { country: 'NG', fxPerUsd: 1700, effectiveFrom: NG_NOV } })
    await db.marketFx.create({ data: { country: 'KE', fxPerUsd: 140, effectiveFrom: KE_NOV } })
    await db.channelShare.create({ data: { channelId: channel.id, share: 0.7, effectiveFrom: at('2026-11-01T00:00:00Z') } })
    const { invoices, statements } = await closeMonth(at('2026-10-01T00:00:00Z'), user.id, CLOSED_AT)
    expect(invoices.map((i) => Number(i.fxPerUsd))).toEqual([1550, 129])
    // (12800 + 9300) × 0.55, not × 0.7
    expect(statements[0].amountCents).toBe(12155)
  })

  it("a charge dated in October but posted after October's close is unbilled, then lands on November's invoice", async () => {
    const { user, kola } = await closeFixture()
    await db.marketFx.create({ data: { country: 'GH', fxPerUsd: 15.5, effectiveFrom: at('2026-09-01T00:00:00Z') } })
    const [octInvoice] = (await closeMonth(at('2026-10-01T00:00:00Z'), user.id, CLOSED_AT)).invoices
    expect(octInvoice).toMatchObject({ workspaceId: kola.id, number: 'INV-0052', amountCents: 14500 })
    expect(await unbilledCents(kola.id)).toBe(2000)

    // The straggler: 31 Oct's last delivery, posted after the close.
    const late = await line(kola.id, '2026-10-31T12:00:00Z', -600, 'Buy 2 get 1 — delivery')
    // 2000 (November) + 600 (October, uninvoiced)
    expect(await unbilledCents(kola.id)).toBe(2600)
    // in use = outstanding 14500 + unbilled 2600 (no campaigns)
    expect(await creditInUseCents(kola.id)).toBe(17100)

    // Closing October again leaves Kola alone: it already has October's invoice.
    expect((await closeMonth(at('2026-10-01T00:00:00Z'), user.id, at('2026-11-02T06:00:00Z'))).invoices).toEqual([])
    expect((await db.ledgerEntry.findUniqueOrThrow({ where: { id: late.id } })).invoiceId).toBeNull()

    // November: Kola 2000 + 600 = 2600 (INV-0054), Pesa 700 (INV-0055), SunFresh 400 (INV-0056).
    const nov = await closeMonth(at('2026-11-01T00:00:00Z'), user.id, at('2026-12-01T06:00:00Z'))
    expect(nov.invoices.map((i) => [i.number, i.amountCents])).toEqual([
      ['INV-0054', 2600],
      ['INV-0055', 700],
      ['INV-0056', 400],
    ])
    expect(nov.invoices[0]).toMatchObject({ workspaceId: kola.id, period: NG_NOV })
    expect((await db.ledgerEntry.findUniqueOrThrow({ where: { id: late.id } })).invoiceId).toBe(nov.invoices[0].id)
    expect(await unbilledCents(kola.id)).toBe(0)
  })

  it('an invoice keeps the country it was issued under; a country change applies from the next invoice', async () => {
    const { user, kola } = await closeFixture()
    await db.marketFx.create({ data: { country: 'GH', fxPerUsd: 15.5, effectiveFrom: at('2026-09-01T00:00:00Z') } })
    const [oct] = (await closeMonth(at('2026-10-01T00:00:00Z'), user.id, CLOSED_AT)).invoices.filter((i) => i.workspaceId === kola.id)
    expect(oct).toMatchObject({ country: 'NG' })

    await db.workspace.update({ where: { id: kola.id }, data: { country: 'KE' } })
    const [nov] = (await closeMonth(at('2026-11-01T00:00:00Z'), user.id, at('2026-12-01T06:00:00Z'))).invoices.filter((i) => i.workspaceId === kola.id)
    expect(nov).toMatchObject({ country: 'KE', period: KE_NOV })
    expect(Number(nov.fxPerUsd)).toBe(129)
    expect(await db.invoice.findUniqueOrThrow({ where: { id: oct.id } })).toMatchObject({ country: 'NG', period: NG_OCT })
    expect(Number((await db.invoice.findUniqueOrThrow({ where: { id: oct.id } })).fxPerUsd)).toBe(1550)
  })

  it("Phoenix settles the October straggler on November's statement, not October's", async () => {
    const { user, channel, kola } = await closeFixture()
    await db.marketFx.create({ data: { country: 'GH', fxPerUsd: 15.5, effectiveFrom: at('2026-09-01T00:00:00Z') } })
    const statementFor = (period: Date) =>
      db.settlementStatement.findUniqueOrThrow({ where: { channelId_period: { channelId: channel.id, period } } })

    await closeMonth(at('2026-10-01T00:00:00Z'), user.id, CLOSED_AT)
    // (12800 + 9300) × 0.55
    expect((await statementFor(at('2026-10-01T00:00:00Z'))).amountCents).toBe(12155)

    await line(kola.id, '2026-10-31T12:00:00Z', -600, 'Buy 2 get 1 — delivery')
    await closeMonth(at('2026-10-01T00:00:00Z'), user.id, at('2026-11-02T06:00:00Z'))
    expect((await statementFor(at('2026-10-01T00:00:00Z'))).amountCents).toBe(12155)

    // November's invoices carry delivery 2000 + 600 (straggler) + 700 + 400 = 3700; the share is 0.6 from 10 Nov.
    const nov = await closeMonth(at('2026-11-01T00:00:00Z'), user.id, at('2026-12-01T06:00:00Z'))
    // 3700 × 0.6
    expect(nov.statements).toMatchObject([{ period: at('2026-11-01T00:00:00Z'), amountCents: 2220 }])
    expect((await statementFor(at('2026-10-01T00:00:00Z'))).amountCents).toBe(12155)
    expect(await db.settlementStatement.count()).toBe(2)
  })

  it('refuses a month that has not ended in every market', async () => {
    const { user } = await closeFixture()
    await expect(closeMonth(at('2026-11-01T00:00:00Z'), user.id, NOW)).rejects.toBe('MONTH_NOT_OVER')
    // 23:30 UTC on 31 Oct: over in Lagos and Nairobi, not yet in Accra.
    await expect(closeMonth(at('2026-10-01T00:00:00Z'), user.id, at('2026-10-31T23:30:00Z'))).rejects.toBe('MONTH_NOT_OVER')
    expect(await db.invoice.count({ where: { status: 'due' } })).toBe(0)
  })

  it('refuses before writing anything when a market has no FX', async () => {
    const { user, sunfresh } = await closeFixture()
    await line(sunfresh.id, '2026-10-20T10:00:00Z', -500, 'Fresh start — delivery')
    await expect(closeMonth(at('2026-10-01T00:00:00Z'), user.id, CLOSED_AT)).rejects.toBe('NO_FX')
    expect(await db.invoice.count({ where: { status: 'due' } })).toBe(0)
    expect(await db.settlementStatement.count()).toBe(0)
  })

  it('without a Phoenix channel there is no statement', async () => {
    const user = await makeUser(true)
    const ws = await makeWorkspace('Kola Bright', 'NG')
    await db.marketFx.create({ data: { country: 'NG', fxPerUsd: 1550, effectiveFrom: at('2026-09-01T00:00:00Z') } })
    await line(ws.id, '2026-10-03T10:00:00Z', -1000, 'x — delivery')
    const { invoices, statements } = await closeMonth(at('2026-10-15T00:00:00Z'), user.id, CLOSED_AT)
    expect(invoices).toHaveLength(1)
    expect(statements).toEqual([])
  })

  it('nextInvoiceNumber starts at INV-0052 and follows the highest number', async () => {
    expect(await nextInvoiceNumber()).toBe('INV-0052')
    const ws = await makeWorkspace('Kola Bright', 'NG')
    const dates = { issuedAt: '2026-09-01T06:00:00Z', dueAt: '2026-09-15T06:00:00Z' }
    await makeInvoice(ws.id, 'INV-0041', NG_OCT, 1, 'paid', dates)
    expect(await nextInvoiceNumber()).toBe('INV-0052')
    await makeInvoice(ws.id, 'INV-0099', NG_OCT, 1, 'paid', dates)
    expect(await nextInvoiceNumber()).toBe('INV-0100')
    await makeInvoice(ws.id, 'INV-9999', NG_OCT, 1, 'paid', dates)
    await makeInvoice(ws.id, 'INV-10000', NG_OCT, 1, 'paid', dates)
    expect(await nextInvoiceNumber()).toBe('INV-10001')
  })
})

describe('ledger and statement', () => {
  it('postLedger with a dedupeKey posts once and returns the same row', async () => {
    const ws = await makeWorkspace('Kola Bright', 'NG')
    const entry = { at: NOW, description: 'Buy 2 get 1 — delivery', amountCents: -11800, kind: 'delivery' as const, dedupeKey: 'delivery:c1:2026-11-13' }
    const a = await postLedger(ws.id, entry)
    const b = await postLedger(ws.id, { ...entry, amountCents: -99999 })
    expect(b.id).toBe(a.id)
    expect(b.amountCents).toBe(-11800)
    await postLedger(ws.id, { ...entry, dedupeKey: undefined })
    expect(await db.ledgerEntry.count()).toBe(2)
  })

  it('postLedger refuses a charge above 0, a payment below 0 and a fraction of a cent', async () => {
    const ws = await makeWorkspace('Kola Bright', 'NG')
    await expect(postLedger(ws.id, { description: 'x', amountCents: 100, kind: 'delivery' })).rejects.toBe('INVALID')
    await expect(postLedger(ws.id, { description: 'x', amountCents: 100, kind: 'reward' })).rejects.toBe('INVALID')
    await expect(postLedger(ws.id, { description: 'x', amountCents: -100, kind: 'payment' })).rejects.toBe('INVALID')
    await expect(postLedger(ws.id, { description: 'x', amountCents: -1.5, kind: 'delivery' })).rejects.toBe('INVALID')
    expect(await db.ledgerEntry.count()).toBe(0)
  })

  it("statement is the workspace's local month, newest first; statementMonths lists months with rows", async () => {
    const { ws } = await briefFixture()
    const nov = await statement(ws.id, NOW)
    expect(nov.map((r) => [r.description, r.amountCents])).toEqual([
      ['Send money free — delivery', -2800],
      ['Send money free — share rewards', -500],
      ['Back to school — delivery', -10200], // 22:30 UTC on 31 Oct is November in Nairobi
    ])
    const oct = await statement(ws.id, at('2026-10-15T00:00:00Z'))
    expect(oct.map((r) => [r.amountCents, r.isPayment])).toEqual([
      [-11000, false],
      [-10000, false],
      [50000, true],
    ])
    expect(oct[2]).toMatchObject({ at: at('2026-10-01T08:00:00Z'), description: 'INV-0041 paid', kind: 'payment' })
    expect(await statementMonths(ws.id)).toEqual([KE_NOV, KE_OCT])
  })
})

describe('credit requests', () => {
  it('requestCredit keeps one open request per workspace', async () => {
    const owner = await makeUser()
    const ws = await makeWorkspace('Pesa Link', 'KE')
    const a = await requestCredit(ws.id, owner.id, 'Committed plan for Q1')
    const b = await requestCredit(ws.id, owner.id)
    expect(b.id).toBe(a.id)
    expect(a).toMatchObject({ status: 'open', requestedById: owner.id, note: 'Committed plan for Q1' })
    expect(await db.creditRequest.count()).toBe(1)
  })

  it('approving sets the limit, audits before and after, and tells the workspace; deciding twice is a no-op', async () => {
    const owner = await makeUser()
    const global = await makeUser(true)
    const ws = await makeWorkspace('Pesa Link', 'KE', { creditLimitCents: 150000 })
    await db.workspaceMember.create({ data: { userId: owner.id, workspaceId: ws.id, role: 'Owner' } })
    const req = await requestCredit(ws.id, owner.id)

    const decided = await decideCredit(req.id, global.id, 'approved', 300000)
    expect(decided).toMatchObject({ status: 'approved', decidedById: global.id })
    expect(decided.decidedAt).toBeInstanceOf(Date)
    expect((await db.workspace.findUniqueOrThrow({ where: { id: ws.id } })).creditLimitCents).toBe(300000)
    const audits = await db.auditEvent.findMany({ where: { action: 'credit.limit' } })
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({
      actorId: global.id, targetType: 'Workspace', targetId: ws.id, workspaceId: ws.id,
      before: { creditLimitCents: 150000 }, after: { creditLimitCents: 300000 },
    })
    expect(await db.notification.findMany({ where: { workspaceId: ws.id } })).toMatchObject([
      { userId: owner.id, kind: 'credit', title: 'Your credit limit is now $3,000' },
    ])

    const again = await decideCredit(req.id, global.id, 'approved', 999900)
    expect(again.status).toBe('approved')
    expect((await db.workspace.findUniqueOrThrow({ where: { id: ws.id } })).creditLimitCents).toBe(300000)
    expect(await db.auditEvent.count({ where: { action: 'credit.limit' } })).toBe(1)

    // A new request after a decision is a new row; dismissing it leaves the limit alone.
    const next = await requestCredit(ws.id, owner.id)
    expect(next.id).not.toBe(req.id)
    const dismissed = await decideCredit(next.id, global.id, 'dismissed')
    expect(dismissed).toMatchObject({ status: 'dismissed', decidedById: global.id })
    expect((await db.workspace.findUniqueOrThrow({ where: { id: ws.id } })).creditLimitCents).toBe(300000)
  })

  it('setCreditLimit refuses a negative limit, audits and tells the workspace', async () => {
    const owner = await makeUser()
    const global = await makeUser(true)
    const ws = await makeWorkspace('Pesa Link', 'KE')
    await db.workspaceMember.create({ data: { userId: owner.id, workspaceId: ws.id, role: 'Owner' } })
    await expect(setCreditLimit(ws.id, -100, global.id)).rejects.toBe('INVALID')
    await setCreditLimit(ws.id, 30000, global.id)
    expect((await db.workspace.findUniqueOrThrow({ where: { id: ws.id } })).creditLimitCents).toBe(30000)
    expect(await db.auditEvent.findFirst({ where: { action: 'credit.limit' } })).toMatchObject({
      before: { creditLimitCents: 50000 }, after: { creditLimitCents: 30000 },
    })
    expect(await db.notification.count({ where: { workspaceId: ws.id, title: 'Your credit limit is now $300' } })).toBe(1)
  })

  it('a limit past what the column holds is refused, in cents and in typed dollars', async () => {
    const global = await makeUser(true)
    const owner = await makeUser()
    const ws = await makeWorkspace('Pesa Link', 'KE')
    await expect(setCreditLimit(ws.id, MAX_LIMIT_CENTS + 1, global.id)).rejects.toBe('INVALID')
    const req = await requestCredit(ws.id, owner.id)
    await expect(decideCredit(req.id, global.id, 'approved', MAX_LIMIT_CENTS + 1)).rejects.toBe('INVALID')
    expect((await db.workspace.findUniqueOrThrow({ where: { id: ws.id } })).creditLimitCents).toBe(50000)
    await setCreditLimit(ws.id, MAX_LIMIT_CENTS, global.id)
    expect((await db.workspace.findUniqueOrThrow({ where: { id: ws.id } })).creditLimitCents).toBe(MAX_LIMIT_CENTS)

    expect(limitFromDollars(99_999_999)).toEqual({ error: 'TOO_LARGE' })
    expect(limitFromDollars(21_474_836)).toEqual({ cents: 2_147_483_600 })
    expect(limitFromDollars(0)).toEqual({ cents: 0 })
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '100']) expect(limitFromDollars(bad)).toEqual({ error: 'INVALID' })
  })

  it('approving needs a whole number of cents at or above 0', async () => {
    const owner = await makeUser()
    const ws = await makeWorkspace('Pesa Link', 'KE')
    const req = await requestCredit(ws.id, owner.id)
    await expect(decideCredit(req.id, owner.id, 'approved', -1)).rejects.toBe('INVALID')
    await expect(decideCredit(req.id, owner.id, 'approved')).rejects.toBe('INVALID')
    await expect(decideCredit(req.id, owner.id, 'approved', 10.5)).rejects.toBe('INVALID')
    expect((await db.creditRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe('open')
    await decideCredit(req.id, owner.id, 'approved', 0)
    expect((await db.workspace.findUniqueOrThrow({ where: { id: ws.id } })).creditLimitCents).toBe(0)
  })
})

describe('money copy', () => {
  it('payment, delivery and rewards lines', () => {
    expect(MONEY.paidLine('INV-0046')).toBe('INV-0046 paid')
    expect(MONEY.deliveryLine('Buy 2 get 1')).toBe('Buy 2 get 1 — delivery')
    expect(MONEY.rewardsLine('Buy 2 get 1')).toBe('Buy 2 get 1 — share rewards')
    expect(MONEY.limitReached).toBe('Credit limit reached.')
  })

  it('how you pay quotes the FX with separators and no trailing zeros; periods read "Sep 2026"', () => {
    expect(MONEY.billing.howYouPay('NGN', '₦', 1550, 'November', 14)).toBe(
      "We invoice on the 1st for the previous month's delivery and rewards, in NGN at a rate fixed for the month (1 USD = ₦1,550 in November). Pay by bank transfer within 14 days, quoting the invoice number.",
    )
    expect(MONEY.billing.howYouPay('GHS', 'GH₵', 15.5, 'November', 14)).toContain('(1 USD = GH₵15.5 in November)')
    expect(periodLabel(at('2026-08-31T21:00:00Z'), 'Africa/Nairobi')).toBe('Sep 2026')
    expect(periodLabel(KE_NOV, 'Africa/Nairobi')).toBe('Nov 2026')
  })
})
