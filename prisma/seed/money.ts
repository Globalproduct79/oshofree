import type { Invoice, Prisma, Workspace } from '@prisma/client'
import { audit, SYSTEM_ACTOR } from '@/lib/audit'
import { db } from '@/lib/db'
import { localMidnight } from '@/lib/market-clock'
import { MARKETS } from '@/lib/markets'
import { FIRST_INVOICE_NUMBER, invoiceDueAt, markInvoicePaid } from '@/lib/money'
import { currentFx } from '@/lib/rates'
import { topUpAggregator } from '@/lib/rewards'
import type { Clock, Timeline } from './timeline'
import type { People } from './users'
import type { Workspaces } from './workspaces'

// The invoices of ADV §8, as the money pipeline makes them (spec §6.14.5). The daily job's month close during
// the replayed history issues last month's invoices from the seeded ledger — the two ended campaigns are anchored
// in last month, so Kola Bright and MediaSpec always have charges there — so their amounts are whatever the
// events produced. Right after that close the seed gives them the inventory's numbers (INV-0041, INV-0044), and
// Global marks Kola's paid three days later, before the job's invoice reminders could call it due.
//
// Two of the inventory's invoices are older than any seeded campaign — MediaSpec's paid one two months back and
// Pesa Link's overdue one — so no close can make them: they are issued directly, as closeMonth would have (on the
// 1st, Net terms, the market's FX for the month), at the inventory's amounts. The "(to date)" rows INV-0049…0051
// are the Invoices page's running row (unbilled charges), never stored: a stored row would stop next month's close.

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
// The daily job closes the month at 02:00 UTC on the 1st.
const CLOSE_HOUR = 2

export const AGGREGATOR_CENTS = 124000

type Listed = { number: string; amountCents: number }
const MEDIASPEC_EARLIER: Listed = { number: 'INV-0037', amountCents: 284000 }
const KOLA_LAST_MONTH = 'INV-0041'
const MEDIASPEC_LAST_MONTH = 'INV-0044'
const PESA_OVERDUE: Listed = { number: 'INV-0046', amountCents: 21000 }

// The calendar month `offset` months from the run day's (UTC, so last month is over in every market): its
// first and last local midnights in the workspace's market, and when the daily job closed it (never after now).
function month(ws: Workspace, now: Date, offset: number) {
  const tz = MARKETS[ws.country].timezone
  const [year, m] = [now.getUTCFullYear(), now.getUTCMonth() + offset]
  return {
    start: localMidnight(tz, year, m, 1),
    end: localMidnight(tz, year, m + 1, 1),
    closedAt: new Date(Math.min(Date.UTC(year, m + 1, 1, CLOSE_HOUR), now.getTime())),
  }
}

// An invoice issued as closeMonth issues one, for a month before the seeded history.
async function issue(ws: Workspace, now: Date, offset: number, listed: Listed): Promise<Invoice> {
  const { start, end, closedAt } = month(ws, now, offset)
  const fxPerUsd = await currentFx(ws.country, new Date(end.getTime() - 1))
  const invoice = await db.invoice.create({
    data: {
      workspaceId: ws.id, number: listed.number, period: start, amountCents: listed.amountCents, fxPerUsd, country: ws.country,
      status: 'due', issuedAt: closedAt, dueAt: invoiceDueAt(end, ws.termsDays, closedAt, MARKETS[ws.country].timezone),
    },
  })
  await audit(SYSTEM_ACTOR, 'invoice.issue', { type: 'Invoice', id: invoice.id, workspaceId: ws.id }, undefined, {
    number: invoice.number, period: invoice.period.toISOString(), amountCents: invoice.amountCents, fxPerUsd, dueAt: invoice.dueAt.toISOString(),
  })
  return invoice
}

// Pesa Link's overdue invoice: last month's when, invoiced on the 1st, its due day has already ended (the instant
// closeMonth sets, money.invoiceDueAt); else the month before.
function pesaOverdueOffset(ws: Workspace, now: Date): number {
  const { end, closedAt } = month(ws, now, -1)
  return invoiceDueAt(end, ws.termsDays, closedAt, MARKETS[ws.country].timezone) <= now ? -1 : -2
}

// Before the campaigns: the aggregator is funded (GLB §2.7: $1,240) and the two older invoices are issued
// (MediaSpec's is paid ten days later).
export function planEarlierMoney(timeline: Timeline, ws: Workspaces, people: People, clock: Clock): void {
  const adminId = people.admin.id
  const funded = clock.utc(-60, 9)
  timeline.add(funded, 'fund the aggregator', () => topUpAggregator(AGGREGATOR_CENTS, adminId, funded))
  const media = month(ws.media, clock.now, -2)
  let earlier: Invoice | null = null
  timeline.add(media.closedAt, `issue ${MEDIASPEC_EARLIER.number}`, async () => {
    earlier = await issue(ws.media, clock.now, -2, MEDIASPEC_EARLIER)
  })
  const paidAt = new Date(media.closedAt.getTime() + 10 * DAY_MS)
  timeline.add(paidAt, `pay ${MEDIASPEC_EARLIER.number}`, () => markInvoicePaid(earlier!.id, adminId, paidAt))
  const pesaOffset = pesaOverdueOffset(ws.pesa, clock.now)
  timeline.add(month(ws.pesa, clock.now, pesaOffset).closedAt, `issue ${PESA_OVERDUE.number}`, () =>
    issue(ws.pesa, clock.now, pesaOffset, PESA_OVERDUE))
}

const numbered = (n: number) => `INV-${String(n).padStart(4, '0')}`

// A closeMonth invoice takes another number, and its issue's audit row says so too.
async function renumber(invoice: Invoice, number: string): Promise<Invoice> {
  const renamed = await db.invoice.update({ where: { id: invoice.id }, data: { number } })
  const issued = await db.auditEvent.findFirst({ where: { action: 'invoice.issue', targetType: 'Invoice', targetId: invoice.id } })
  if (issued) {
    await db.auditEvent.update({ where: { id: issued.id }, data: { after: { ...(issued.after as Prisma.JsonObject), number } } })
  }
  return renamed
}

// Last month's close happens in the daily job's run for its last day (02:00 UTC on the 1st, or now when that is
// still ahead). Straight after it, Kola Bright's and MediaSpec's invoices take the inventory's numbers; Kola's is
// paid three days later (or as late as now allows).
export function planLastMonth(timeline: Timeline, ws: Workspaces, people: People, clock: Clock): void {
  const now = clock.now
  const closedAt = month(ws.kola, now, -1).closedAt
  let kola: Invoice | null = null
  timeline.add(closedAt, 'number last month\'s invoices', async () => {
    for (const [w, number] of [[ws.kola, KOLA_LAST_MONTH], [ws.media, MEDIASPEC_LAST_MONTH]] as const) {
      const closed = await db.invoice.findFirst({ where: { workspaceId: w.id, period: month(w, now, -1).start } })
      if (!closed) throw new Error(`${w.name} has no invoice for last month: its ended campaign should have charges there`)
      const renamed = await renumber(closed, number)
      if (w.id === ws.kola.id) kola = renamed
    }
  }, 3.5)
  const paidAt = new Date(Math.max(closedAt.getTime(), Math.min(closedAt.getTime() + 3 * DAY_MS, now.getTime() - HOUR_MS)))
  timeline.add(paidAt, `pay ${KOLA_LAST_MONTH}`, () => markInvoicePaid(kola!.id, people.admin.id, paidAt), 3.6)
}

// After the history: any other invoice the closes issued keeps the sequence from INV-0052.
export async function renumberTheRest(): Promise<void> {
  const rest = await db.invoice.findMany({ where: { number: { gte: numbered(FIRST_INVOICE_NUMBER) } }, orderBy: { number: 'asc' } })
  for (const [i, inv] of rest.entries()) {
    const number = numbered(FIRST_INVOICE_NUMBER + i)
    if (inv.number !== number) await renumber(inv, number)
  }
}
