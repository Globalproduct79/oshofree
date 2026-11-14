import type { Invoice, Workspace } from '@prisma/client'
import { audit, SYSTEM_ACTOR } from '@/lib/audit'
import { db } from '@/lib/db'
import { localMidnight } from '@/lib/market-clock'
import { MARKETS } from '@/lib/markets'
import { FIRST_INVOICE_NUMBER, markInvoicePaid } from '@/lib/money'
import { currentFx } from '@/lib/rates'
import { topUpAggregator } from '@/lib/rewards'
import type { Clock, Stamper, Timeline } from './timeline'
import type { People } from './users'
import type { Workspaces } from './workspaces'

// The invoices of ADV §8, as the money pipeline makes them (spec §6.14.5). The daily job's month close during
// the replayed history issues the previous month's invoices from the seeded ledger, so their amounts are
// whatever the events produced; the seed gives them the inventory's numbers and Global marks Kola's paid.
//
// Two of the inventory's invoices are older than any seeded campaign — MediaSpec's paid one two months back and
// Pesa Link's overdue one — so no close can make them: they are issued directly, as closeMonth would have
// (on the 1st, Net terms, the market's FX for the month), at the inventory's amounts. The same goes for an
// October invoice on a run day whose history no longer reaches October. The "(to date)" rows INV-0049…0051 are
// the Invoices page's running row (unbilled charges), never stored: a stored row would stop next month's close.

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
// The daily job closes the month at 02:00 UTC on the 1st.
const CLOSE_HOUR = 2

export const AGGREGATOR_CENTS = 124000

type Listed = { number: string; amountCents: number }
const MEDIASPEC_EARLIER: Listed = { number: 'INV-0037', amountCents: 284000 }
const KOLA_LAST_MONTH: Listed = { number: 'INV-0041', amountCents: 112000 }
const MEDIASPEC_LAST_MONTH: Listed = { number: 'INV-0044', amountCents: 361000 }
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

// An invoice issued as closeMonth issues one, for a month with no seeded history.
async function issue(ws: Workspace, now: Date, offset: number, listed: Listed): Promise<Invoice> {
  const { start, end, closedAt } = month(ws, now, offset)
  const fxPerUsd = await currentFx(ws.country, new Date(end.getTime() - 1))
  const invoice = await db.invoice.create({
    data: {
      workspaceId: ws.id, number: listed.number, period: start, amountCents: listed.amountCents, fxPerUsd, country: ws.country,
      status: 'due', issuedAt: closedAt, dueAt: new Date(closedAt.getTime() + ws.termsDays * DAY_MS),
    },
  })
  await audit(SYSTEM_ACTOR, 'invoice.issue', { type: 'Invoice', id: invoice.id, workspaceId: ws.id }, undefined, {
    number: invoice.number, period: invoice.period.toISOString(), amountCents: invoice.amountCents, fxPerUsd, dueAt: invoice.dueAt.toISOString(),
  })
  return invoice
}

// Pesa Link's overdue invoice: last month's when, invoiced on the 1st, it is already past due; else the month before.
function pesaOverdueOffset(ws: Workspace, now: Date): number {
  const { closedAt } = month(ws, now, -1)
  return closedAt.getTime() + ws.termsDays * DAY_MS < now.getTime() ? -1 : -2
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

// After the history: last month's invoices for Kola Bright (paid three days after issue) and MediaSpec (due)
// take the inventory's numbers; any other invoice the closes issued keeps the sequence from INV-0052.
export async function settleLastMonth(ws: Workspaces, people: People, clock: Clock, stamp: Stamper): Promise<void> {
  const now = clock.now
  const lastMonth = async (w: Workspace, listed: Listed): Promise<Invoice> => {
    const { start, closedAt } = month(w, now, -1)
    const closed = await db.invoice.findFirst({ where: { workspaceId: w.id, period: start } })
    if (closed) return db.invoice.update({ where: { id: closed.id }, data: { number: listed.number } })
    return stamp.at(closedAt, () => issue(w, now, -1, listed))
  }
  const kola = await lastMonth(ws.kola, KOLA_LAST_MONTH)
  await lastMonth(ws.media, MEDIASPEC_LAST_MONTH)
  const issued = kola.issuedAt.getTime()
  const paidAt = new Date(Math.max(issued, Math.min(issued + 3 * DAY_MS, now.getTime() - HOUR_MS)))
  await stamp.at(paidAt, () => markInvoicePaid(kola.id, people.admin.id, paidAt))

  const first = `INV-${String(FIRST_INVOICE_NUMBER).padStart(4, '0')}`
  const rest = await db.invoice.findMany({ where: { number: { gte: first } }, orderBy: { number: 'asc' } })
  for (const [i, inv] of rest.entries()) {
    const number = `INV-${String(FIRST_INVOICE_NUMBER + i).padStart(4, '0')}`
    if (inv.number !== number) await db.invoice.update({ where: { id: inv.id }, data: { number } })
  }
}
