import { localMidnight } from '@/lib/campaign-schema'
import { db } from '@/lib/db'
import type { Country } from '@/lib/markets'

// Time for the seed. Every date is relative to the run day (ADV "Seed campaigns": the prototype's dates are
// relative to 13 Nov 2026), so the demo always looks current. Days are counted from now's UTC date; a time
// on a day is that market's wall clock.

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000

export type Clock = ReturnType<typeof makeClock>

export function makeClock(now: Date) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  // 'YYYY-MM-DD', `offset` days from today.
  const date = (offset: number) => new Date(today + offset * DAY_MS).toISOString().slice(0, 10)
  return {
    now,
    date,
    // `hour` o'clock in the market on the day `offset` days from today.
    at: (offset: number, country: Country, hour: number) =>
      new Date(localMidnight(date(offset), country).getTime() + hour * HOUR_MS),
    // `hour` UTC on the day `offset` days from today.
    utc: (offset: number, hour = 0) => new Date(today + offset * DAY_MS + hour * HOUR_MS),
    // Noon UTC is inside that calendar day in every market (UTC+0 to UTC+3): the daily job's `day`.
    noon: (ymd: string) => new Date(`${ymd}T12:00:00.000Z`),
    hoursAgo: (hours: number) => new Date(now.getTime() - hours * HOUR_MS),
  }
}

// The real paths date notifications and audit rows with the wall clock. The seed runs each step "at" its
// simulated time and then dates the rows that step wrote to that time, so the bell reads "1d ago" and the
// audit trail reads the day it happened. Rows are tracked by id: a row is dated once, by the step that wrote it.
export class Stamper {
  private readonly notes = new Set<string>()
  private readonly audits = new Set<string>()

  async at<T>(when: Date, work: () => Promise<T>): Promise<T> {
    const out = await work()
    const notes = await db.notification.findMany({ where: { id: { notIn: [...this.notes] } }, select: { id: true } })
    if (notes.length) {
      await db.notification.updateMany({ where: { id: { in: notes.map((n) => n.id) } }, data: { createdAt: when } })
      for (const n of notes) this.notes.add(n.id)
    }
    const audits = await db.auditEvent.findMany({ where: { id: { notIn: [...this.audits] } }, select: { id: true } })
    if (audits.length) {
      await db.auditEvent.updateMany({ where: { id: { in: audits.map((a) => a.id) } }, data: { at: when } })
      for (const a of audits) this.audits.add(a.id)
    }
    return out
  }
}

type Step = { at: Date; order: number; seq: number; name: string; run: () => Promise<unknown> }

// The seed's history as steps in time order (ties by `order`, then by when they were added), each run at its
// moment through the Stamper. Nothing may happen after now.
export class Timeline {
  private readonly steps: Step[] = []

  constructor(
    private readonly now: Date,
    private readonly stamp: Stamper,
  ) {}

  add(at: Date, name: string, run: () => Promise<unknown>, order = 0): void {
    if (at > this.now) throw new Error(`Seed step "${name}" is after now (${at.toISOString()})`)
    this.steps.push({ at, order, seq: this.steps.length, name, run })
  }

  async run(): Promise<void> {
    const steps = [...this.steps].sort((a, b) => a.at.getTime() - b.at.getTime() || a.order - b.order || a.seq - b.seq)
    for (const s of steps) {
      try {
        await this.stamp.at(s.at, s.run)
      } catch (e) {
        throw new Error(`Seed step "${s.name}" at ${s.at.toISOString()} failed: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }
}
