import type {
  CampaignStatus, CreditRequest, Invoice, InvoiceStatus, LedgerEntry, LedgerKind, SettlementStatement,
} from '@prisma/client'
import { audit } from '@/lib/audit'
import { MONEY } from '@/lib/copy-money'
import { NOTIFY } from '@/lib/copy-notifications'
import { db, type Tx } from '@/lib/db'
import { COUNTRIES, MARKETS, type Country } from '@/lib/markets'
import { localMidnight, wallClock } from '@/lib/market-clock'
import { notifyWorkspace } from '@/lib/notifications'
import { currentFx, currentShare } from '@/lib/rates'

// Post-paid credit against monthly invoices (ADV §7–§8, spec §6.5). Every amount is integer USD
// cents; charges (delivery, rewards) are negative ledger rows and payments positive ones.

export const FIRST_INVOICE_NUMBER = 52
export const NEAR_LIMIT = 0.85
const CHARGES: LedgerKind[] = ['delivery', 'reward']
// Ended and rejected campaigns release their remainder; drafts never held any.
export const COMMITTED: CampaignStatus[] = ['live', 'review', 'scheduled', 'paused']
const SETTLEMENT_CHANNEL = 'phoenix'
const DAY_MS = 86_400_000
// Serialises invoice issuing, so two closes can neither double-invoice nor share a number. The daily job takes it
// too before it raises an uninvoiced delivery line, so a close never sums a line at one amount and tags it at another.
export const INVOICE_LOCK = 805_200

// The daily job closes a month on the 1st and retries on the 2nd: a close this soon after the month ended is the
// month's own close, however late in that window it ran.
const CLOSE_WINDOW_MS = 2 * DAY_MS

// When an invoice falls due (the controller's ruling, Prompt 5): the market's local midnight that ENDS its due day, so
// "Due 15 Nov" is due all of the 15th and overdue from the 16th. The due day is `termsDays` after the 1st (the market's
// first local midnight after the month), so it is the one Invoices showed for the running month, whether the 1st's
// run issued the invoice or the 2nd's; a close later than that (Global's Close month, weeks on) counts the terms from
// its own issue day instead.
export function invoiceDueAt(monthEnd: Date, termsDays: number, issuedAt: Date, timeZone: string): Date {
  const from = issuedAt.getTime() - monthEnd.getTime() <= CLOSE_WINDOW_MS ? monthEnd : issuedAt
  const { year, month, day } = wallClock(timeZone, from)
  return localMidnight(timeZone, year, month, day + termsDays + 1)
}

// The due day itself, for printing its date ("Due 15 Nov"): the last instant before dueAt.
export const dueDay = (dueAt: Date): Date => new Date(dueAt.getTime() - 1)

// The last instant before an exclusive end: lookups use effectiveFrom ≤ at.
const lastInstant = (end: Date) => new Date(end.getTime() - 1)

// −Σ of charge rows as a positive number (and 0, never −0, when there are none).
const charged = (sum: number | null) => (sum ? -sum : 0)

// ---- Months in a market's time zone ----

// The UTC instant of local midnight on the 1st of (year, month) — month is 0-based and may overflow.
const localMonthStart = (timeZone: string, year: number, month: number): Date => localMidnight(timeZone, year, month, 1)

const localMonth = (timeZone: string, year: number, month: number) => ({
  start: localMonthStart(timeZone, year, month),
  end: localMonthStart(timeZone, year, month + 1),
})

// The calendar month containing `period` in the market's time zone: its first local midnight and the
// next month's, as UTC instants. Invoice.period stores `start`.
export function monthBounds(country: Country, period: Date): { start: Date; end: Date } {
  const timeZone = MARKETS[country].timezone
  const { year, month } = wallClock(timeZone, period)
  return localMonth(timeZone, year, month)
}

// The calendar month a close is for, read where `period` is latest, so the 1st at 00:00 UTC, any
// market's first local midnight (a stored Invoice.period) and any day inside the month all name it.
function calendarMonth(period: Date): { year: number; month: number } {
  const latest = COUNTRIES.map((c) => wallClock(MARKETS[c].timezone, period))
    .reduce((a, b) => (b.year * 12 + b.month > a.year * 12 + a.month ? b : a))
  return { year: latest.year, month: latest.month }
}

// The month "Close month" closes: the one before the month it already is in the market furthest ahead, so a
// click just after midnight there names the month that has not yet ended everywhere (closeMonth refuses it).
// As the 1st at 00:00 UTC, which calendarMonth reads back as that month.
export function monthToClose(now: Date): Date {
  const { year, month } = calendarMonth(now)
  return new Date(Date.UTC(year, month - 1, 1))
}

// ---- Ledger ----

export type LedgerInput = {
  at?: Date
  description: string
  amountCents: number
  kind: LedgerKind
  campaignId?: string
  invoiceId?: string
  dedupeKey?: string
}

// With a dedupeKey, posting again returns the first row unchanged.
export async function postLedger(workspaceId: string, entry: LedgerInput, tx: Tx = db): Promise<LedgerEntry> {
  const { amountCents, kind } = entry
  if (!Number.isInteger(amountCents)) throw 'INVALID'
  if (CHARGES.includes(kind) && amountCents > 0) throw 'INVALID'
  if (kind === 'payment' && amountCents < 0) throw 'INVALID'
  const data = { ...entry, workspaceId, at: entry.at ?? new Date() }
  if (!entry.dedupeKey) return tx.ledgerEntry.create({ data })
  // ON CONFLICT DO NOTHING: no unique-violation error, so it is safe inside a transaction too.
  await tx.ledgerEntry.createMany({ data: [data], skipDuplicates: true })
  return tx.ledgerEntry.findUniqueOrThrow({ where: { dedupeKey: entry.dedupeKey } })
}

export type StatementRow = {
  id: string
  at: Date
  description: string
  amountCents: number
  kind: LedgerKind
  isPayment: boolean
  // The rate of the invoice the row is on (a charge it billed, or the payment of it), so the row's local amount is the
  // invoice's; null while the row is unbilled, or when the invoice was issued in another currency.
  fxPerUsd: number | null
}

// The ledger rows of the workspace's local month containing `month`, newest first.
export async function statement(workspaceId: string, month: Date): Promise<StatementRow[]> {
  const { country } = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { country: true } })
  const { start, end } = monthBounds(country, month)
  const rows = await db.ledgerEntry.findMany({
    where: { workspaceId, at: { gte: start, lt: end } },
    orderBy: [{ at: 'desc' }, { kind: 'asc' }, { id: 'asc' }],
    include: { invoice: { select: { fxPerUsd: true, country: true } } },
  })
  return rows.map(({ id, at, description, amountCents, kind, invoice }) => ({
    id, at, description, amountCents, kind, isPayment: kind === 'payment',
    fxPerUsd: invoice && invoice.country === country ? Number(invoice.fxPerUsd) : null,
  }))
}

// The local months that have ledger rows, newest first, each as its first local midnight.
export async function statementMonths(workspaceId: string): Promise<Date[]> {
  const { country } = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { country: true } })
  const timeZone = MARKETS[country].timezone
  const rows = await db.$queryRaw<{ month: Date }[]>`
    SELECT DISTINCT date_trunc('month', ("at" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}) AS month
    FROM "LedgerEntry" WHERE "workspaceId" = ${workspaceId}
    ORDER BY month DESC`
  return rows.map(({ month }) => localMonthStart(timeZone, month.getUTCFullYear(), month.getUTCMonth()))
}

// ---- Credit ----

// What the campaign has been charged: delivery and rewards, invoiced or not.
export async function campaignSpendCents(campaignId: string): Promise<number> {
  const { _sum } = await db.ledgerEntry.aggregate({ where: { campaignId, kind: { in: CHARGES } }, _sum: { amountCents: true } })
  return charged(_sum.amountCents)
}

// campaignSpendCents for many campaigns in one query; a campaign with no charges is absent.
export async function spendByCampaign(campaignIds: string[]): Promise<Map<string, number>> {
  if (!campaignIds.length) return new Map()
  const spent = await db.ledgerEntry.groupBy({
    by: ['campaignId'],
    where: { campaignId: { in: campaignIds }, kind: { in: CHARGES } },
    _sum: { amountCents: true },
  })
  return new Map(spent.flatMap((s) => (s.campaignId ? [[s.campaignId, charged(s._sum.amountCents)] as const] : [])))
}

// Σ (budget − spend) over live, review, scheduled and paused campaigns, each floored at 0.
export async function committedCents(workspaceId: string): Promise<number> {
  const campaigns = await db.campaign.findMany({
    where: { workspaceId, status: { in: COMMITTED } },
    select: { id: true, budgetUsd: true },
  })
  const spend = await spendByCampaign(campaigns.map((c) => c.id))
  return campaigns.reduce((sum, c) => sum + Math.max(0, c.budgetUsd * 100 - (spend.get(c.id) ?? 0)), 0)
}

// Issued and unpaid: due, overdue included.
export async function outstandingCents(workspaceId: string): Promise<number> {
  const { _sum } = await db.invoice.aggregate({ where: { workspaceId, status: 'due' }, _sum: { amountCents: true } })
  return _sum.amountCents ?? 0
}

// Every charge not yet on an invoice, whatever its date: a charge posted after its month was closed
// still counts, and rides on the next invoice.
export async function unbilledCents(workspaceId: string): Promise<number> {
  const { _sum } = await db.ledgerEntry.aggregate({
    where: { workspaceId, kind: { in: CHARGES }, invoiceId: null },
    _sum: { amountCents: true },
  })
  return charged(_sum.amountCents)
}

export type CreditSummary = {
  limitCents: number
  inUseCents: number
  availableCents: number
  unbilledCents: number
  outstandingCents: number
  committedCents: number
  nearLimit: boolean
  overLimit: boolean
}

// In use = outstanding invoices + unbilled charges + committed budgets (ADV §7).
export async function creditSummary(workspaceId: string): Promise<CreditSummary> {
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { creditLimitCents: true } })
  const [outstanding, unbilled, committed] = await Promise.all([
    outstandingCents(workspaceId),
    unbilledCents(workspaceId),
    committedCents(workspaceId),
  ])
  const limit = ws.creditLimitCents
  const inUse = outstanding + unbilled + committed
  return {
    limitCents: limit,
    inUseCents: inUse,
    availableCents: Math.max(0, limit - inUse),
    unbilledCents: unbilled,
    outstandingCents: outstanding,
    committedCents: committed,
    nearLimit: inUse > NEAR_LIMIT * limit,
    overLimit: inUse > limit,
  }
}

export const creditInUseCents = async (workspaceId: string) => (await creditSummary(workspaceId)).inUseCents
export const availableCents = async (workspaceId: string) => (await creditSummary(workspaceId)).availableCents

// A new budget (or, when editing, only its increase) must fit under the limit. The caller builds the
// hint from the result: MONEY.overCredit(limitCents, excessCents).
export async function canSubmitBudget(
  workspaceId: string, budgetCents: number, increaseOnly = budgetCents,
): Promise<{ ok: boolean; excessCents: number; limitCents: number }> {
  const { inUseCents, limitCents } = await creditSummary(workspaceId)
  const after = inUseCents + increaseOnly
  return { ok: after <= limitCents, excessCents: Math.max(0, after - limitCents), limitCents }
}

// ---- Invoices ----

export type InvoiceDisplayStatus = 'open' | 'due' | 'overdue' | 'paid'

// The badge each status wears on Invoices, the printed invoice and Platform › Advertisers: the running month is "Open".
export const INVOICE_BADGE = { paid: 'paid', due: 'due', overdue: 'overdue', open: 'issued' } as const satisfies Record<InvoiceDisplayStatus, string>

// `open` is the running "(to date)" row the pages build; `overdue` is a due invoice whose due day has ended (dueAt is
// the midnight that ends it).
export function invoiceStatus(inv: { status: InvoiceStatus; dueAt: Date }, now = new Date()): InvoiceDisplayStatus {
  if (inv.status === 'due') return inv.dueAt <= now ? 'overdue' : 'due'
  return inv.status
}

// One global sequence: INV-0052 upward, always past the highest number already issued.
export async function nextInvoiceNumber(tx: Tx = db): Promise<string> {
  const [{ max }] = await tx.$queryRaw<{ max: number | null }[]>`
    SELECT max(substring("number" from '[0-9]+$')::int) AS max FROM "Invoice"`
  return `INV-${String(Math.max(FIRST_INVOICE_NUMBER, (max ?? 0) + 1)).padStart(4, '0')}`
}

// Issues the month's invoice to every workspace with uninvoiced charges up to the end of its own
// market's month — stragglers from earlier months included — then Phoenix's settlement statement.
// Re-running is a no-op. A month still running in any market, or a market without FX, is refused
// before anything is written. Rates and shares are read at the month's last instant: one stamped at
// the next month's first midnight belongs to the next month.
export async function closeMonth(
  period: Date, byUserId: string, now = new Date(),
): Promise<{ invoices: Invoice[]; statements: SettlementStatement[] }> {
  const { year, month } = calendarMonth(period)
  const bounds = new Map(COUNTRIES.map((c) => [c, localMonth(MARKETS[c].timezone, year, month)]))
  if ([...bounds.values()].some((b) => b.end > now)) throw 'MONTH_NOT_OVER'

  const pending = await Promise.all(
    COUNTRIES.map((country) => {
      return db.ledgerEntry.findMany({
        where: { invoiceId: null, kind: { in: CHARGES }, at: { lt: bounds.get(country)!.end }, workspace: { country } },
        distinct: ['workspaceId'],
        select: { workspaceId: true },
      })
    }),
  )
  const workspaces = await db.workspace.findMany({
    where: { id: { in: pending.flat().map((r) => r.workspaceId) } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  const fx = new Map<Country, number>()
  for (const country of new Set(workspaces.map((w) => w.country))) fx.set(country, await currentFx(country, lastInstant(bounds.get(country)!.end)))

  // Any market's first local midnight lies within a day of the 1st at 00:00 UTC.
  const utcStart = Date.UTC(year, month, 1)
  const thisMonth = { gte: new Date(utcStart - DAY_MS), lt: new Date(utcStart + DAY_MS) }

  const invoices: Invoice[] = []
  for (const ws of workspaces) {
    const { start, end } = bounds.get(ws.country)!
    const invoice = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${INVOICE_LOCK}::bigint)`
      if (await tx.invoice.findFirst({ where: { workspaceId: ws.id, period: thisMonth }, select: { id: true } })) return null
      const rows = await tx.ledgerEntry.findMany({
        where: { workspaceId: ws.id, invoiceId: null, kind: { in: CHARGES }, at: { lt: end } },
        select: { id: true, amountCents: true },
      })
      if (!rows.length) return null
      const created = await tx.invoice.create({
        data: {
          workspaceId: ws.id,
          number: await nextInvoiceNumber(tx),
          period: start,
          amountCents: charged(rows.reduce((s, r) => s + r.amountCents, 0)),
          fxPerUsd: fx.get(ws.country)!,
          country: ws.country,
          status: 'due',
          issuedAt: now,
          dueAt: invoiceDueAt(end, ws.termsDays, now, MARKETS[ws.country].timezone),
        },
      })
      await tx.ledgerEntry.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { invoiceId: created.id } })
      return created
    })
    if (!invoice) continue
    invoices.push(invoice)
    await audit(byUserId, 'invoice.issue', { type: 'Invoice', id: invoice.id, workspaceId: ws.id }, undefined, {
      number: invoice.number,
      period: invoice.period.toISOString(),
      amountCents: invoice.amountCents,
      fxPerUsd: Number(invoice.fxPerUsd),
      dueAt: invoice.dueAt.toISOString(),
    })
  }

  return { invoices, statements: await settle(year, month, thisMonth) }
}

// Phoenix is owed its share of the delivery charges invoiced in this month's close — a straggler from an
// earlier month included, so each charge is settled exactly once; rewards are not delivery. One
// statement per channel and month, keyed on the 1st at 00:00 UTC; an existing one is kept.
async function settle(
  year: number, month: number, invoicePeriod: { gte: Date; lt: Date },
): Promise<SettlementStatement[]> {
  const channel = await db.channel.findUnique({ where: { key: SETTLEMENT_CHANNEL }, select: { id: true } })
  if (!channel) return []
  const { _sum } = await db.ledgerEntry.aggregate({
    where: { kind: 'delivery', invoice: { period: invoicePeriod } },
    _sum: { amountCents: true },
  })
  const delivered = charged(_sum.amountCents)
  if (!delivered) return []
  const period = new Date(Date.UTC(year, month, 1))
  const share = await currentShare(channel.id, lastInstant(new Date(Date.UTC(year, month + 1, 1))))
  await db.settlementStatement.createMany({
    data: [{ channelId: channel.id, period, amountCents: Math.round(delivered * share) }],
    skipDuplicates: true,
  })
  return [await db.settlementStatement.findUniqueOrThrow({ where: { channelId_period: { channelId: channel.id, period } } })]
}

// Global records the bank transfer: the invoice is paid, a payment line is posted and the credit is
// released. Paying a paid invoice again changes nothing.
export async function markInvoicePaid(id: string, byUserId: string, now = new Date()): Promise<Invoice> {
  const invoice = await db.invoice.findUnique({ where: { id } })
  if (!invoice) throw 'NOT_FOUND'
  if (invoice.status === 'paid') return invoice
  const paid = await db.$transaction(async (tx) => {
    const { count } = await tx.invoice.updateMany({ where: { id, status: { not: 'paid' } }, data: { status: 'paid', paidAt: now } })
    if (!count) return false
    await postLedger(invoice.workspaceId, {
      at: now,
      description: MONEY.paidLine(invoice.number),
      amountCents: invoice.amountCents,
      kind: 'payment',
      invoiceId: invoice.id,
      dedupeKey: `payment:${invoice.id}`,
    }, tx)
    return true
  })
  if (paid) {
    await audit(byUserId, 'invoice.paid', { type: 'Invoice', id, workspaceId: invoice.workspaceId },
      { status: invoice.status }, { status: 'paid', paidAt: now.toISOString() })
  }
  return db.invoice.findUniqueOrThrow({ where: { id } })
}

// ---- Credit limit and requests ----

// Workspace.creditLimitCents is a 32-bit integer: a larger limit is refused, never overflowed into an error.
export const MAX_LIMIT_CENTS = 2_147_483_647

const isLimit = (cents: unknown): cents is number =>
  Number.isInteger(cents) && (cents as number) >= 0 && (cents as number) <= MAX_LIMIT_CENTS

// A limit typed in whole dollars (the Advertisers fields), as cents, or why it cannot be one.
export function limitFromDollars(dollars: unknown): { cents: number } | { error: 'INVALID' | 'TOO_LARGE' } {
  if (typeof dollars !== 'number' || !Number.isInteger(dollars) || dollars < 0) return { error: 'INVALID' }
  const cents = dollars * 100
  return cents <= MAX_LIMIT_CENTS ? { cents } : { error: 'TOO_LARGE' }
}

async function writeLimit(tx: Tx, workspaceId: string, limitCents: number): Promise<number> {
  const { creditLimitCents: before } = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { creditLimitCents: true } })
  await tx.workspace.update({ where: { id: workspaceId }, data: { creditLimitCents: limitCents } })
  return before
}

async function limitChanged(workspaceId: string, byUserId: string, before: number, after: number) {
  await audit(byUserId, 'credit.limit', { type: 'Workspace', id: workspaceId, workspaceId },
    { creditLimitCents: before }, { creditLimitCents: after })
  await notifyWorkspace(workspaceId, 'credit', NOTIFY.creditLimit(after).title, undefined, '/app/billing')
}

// Global sets a workspace's limit (Advertisers): ≥ 0, audited, and the workspace is told.
export async function setCreditLimit(workspaceId: string, limitCents: number, byUserId: string): Promise<void> {
  if (!isLimit(limitCents)) throw 'INVALID'
  const before = await writeLimit(db, workspaceId, limitCents)
  await limitChanged(workspaceId, byUserId, before, limitCents)
}

// "Request a higher limit": at most one open request per workspace.
export async function requestCredit(workspaceId: string, byUserId: string, note?: string): Promise<CreditRequest> {
  const open = await db.creditRequest.findFirst({ where: { workspaceId, status: 'open' } })
  return open ?? db.creditRequest.create({ data: { workspaceId, requestedById: byUserId, note } })
}

// Global approves (setting the new limit) or dismisses. Deciding a decided request changes nothing.
export async function decideCredit(
  id: string, byUserId: string, decision: 'approved' | 'dismissed', newLimitCents?: number,
): Promise<CreditRequest> {
  const request = await db.creditRequest.findUnique({ where: { id } })
  if (!request) throw 'NOT_FOUND'
  if (request.status !== 'open') return request
  if (decision === 'approved' && !isLimit(newLimitCents)) throw 'INVALID'
  // null when another decision got there first; otherwise the limit before an approval (null on a dismissal).
  const won = await db.$transaction(async (tx) => {
    const { count } = await tx.creditRequest.updateMany({
      where: { id, status: 'open' },
      data: { status: decision, decidedAt: new Date(), decidedById: byUserId },
    })
    if (!count) return null
    return { before: decision === 'approved' ? await writeLimit(tx, request.workspaceId, newLimitCents!) : null }
  })
  if (won) {
    await audit(byUserId, 'credit.decide', { type: 'CreditRequest', id, workspaceId: request.workspaceId },
      { status: 'open' }, { status: decision })
    if (won.before !== null) await limitChanged(request.workspaceId, byUserId, won.before, newLimitCents!)
  }
  return db.creditRequest.findUniqueOrThrow({ where: { id } })
}

// ---- Phoenix settlement statements ----

// Global records that Phoenix was paid: open -> paid. Paying a paid statement again changes nothing.
export async function markStatementPaid(id: string, byUserId: string, now = new Date()) {
  const statement = await db.settlementStatement.findUnique({ where: { id } })
  if (!statement) throw 'NOT_FOUND'
  if (statement.status === 'paid') return statement
  const { count } = await db.settlementStatement.updateMany({ where: { id, status: 'open' }, data: { status: 'paid', paidAt: now } })
  if (count) {
    await audit(byUserId, 'statement.paid', { type: 'SettlementStatement', id }, { status: 'open' }, { status: 'paid', paidAt: now.toISOString() })
  }
  return db.settlementStatement.findUniqueOrThrow({ where: { id } })
}

// The channel's closed months, newest first.
export function pastStatements(channelId: string) {
  return db.settlementStatement.findMany({ where: { channelId }, orderBy: { period: 'desc' } })
}
