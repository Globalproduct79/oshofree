import { NOTIFY } from '@/lib/copy-notifications'
import { db } from '@/lib/db'
import { MARKETS } from '@/lib/markets'
import { markRead, notifyWorkspace } from '@/lib/notifications'
import type { Clock, Stamper } from './timeline'

// The bell (ADV §12) holds only what the real paths said during the replayed history — in review, scheduled,
// live, ended, pace, approvals, credit limits — dated when they said it. The seed adds two kinds the real paths
// do not send yet: each workspace's unpaid invoice (due, or overdue), from its real amount and dates, and
// SunFresh's "awaiting approval" (workspaces.ts).

const DAY_MS = 86_400_000
// The people have read what is older than this; the newer items are unread, as on a working morning.
const READ_BEFORE_MS = 2 * DAY_MS

// A due invoice is announced a day ago (or when issued, if later); an overdue one on the day it fell due.
export async function invoiceNotices(clock: Clock, stamp: Stamper): Promise<void> {
  const now = clock.now
  const unpaid = await db.invoice.findMany({ where: { status: 'due' }, orderBy: { number: 'asc' } })
  for (const inv of unpaid) {
    const tz = MARKETS[inv.country].timezone
    if (inv.dueAt > now) {
      const at = new Date(Math.max(inv.issuedAt.getTime(), now.getTime() - DAY_MS))
      const told = NOTIFY.invoiceDue(inv.number, Math.ceil((inv.dueAt.getTime() - at.getTime()) / DAY_MS), inv.amountCents)
      await stamp.at(at, () => notifyWorkspace(inv.workspaceId, 'credit', told.title, told.detail, '/app/invoices'))
    } else {
      const told = NOTIFY.invoiceOverdue(inv.number, inv.amountCents, inv.dueAt, tz)
      await stamp.at(inv.dueAt, () => notifyWorkspace(inv.workspaceId, 'credit', told.title, told.detail, '/app/invoices'))
    }
  }
}

// Each person has opened their bell since anything older than two days.
export async function readOlder(clock: Clock): Promise<void> {
  const seen = await db.notification.findMany({
    where: { readAt: null, userId: { not: null }, createdAt: { lt: new Date(clock.now.getTime() - READ_BEFORE_MS) } },
    select: { id: true, userId: true },
  })
  for (const n of seen) await markRead(n.id, n.userId!)
}
