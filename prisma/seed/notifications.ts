import { db } from '@/lib/db'
import { markRead } from '@/lib/notifications'
import type { Clock } from './timeline'

// The bell (ADV §12) holds only what the real paths said during the replayed history — awaiting approval,
// approved, credit limits, in review, scheduled, live, ended, pace, invoices due and overdue, Monday digests —
// dated when they said it (the Stamper). The seed itself writes none.

const DAY_MS = 86_400_000
// The people have read what is older than this; the newer items are unread, as on a working morning.
const READ_BEFORE_MS = 2 * DAY_MS

// Each person has opened their bell since anything older than two days.
export async function readOlder(clock: Clock): Promise<void> {
  const seen = await db.notification.findMany({
    where: { readAt: null, userId: { not: null }, createdAt: { lt: new Date(clock.now.getTime() - READ_BEFORE_MS) } },
    select: { id: true, userId: true },
  })
  for (const n of seen) await markRead(n.id, n.userId!)
}
