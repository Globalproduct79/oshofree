import { MARKETS, type Country } from '@/lib/markets'

// Days and months in a market's time zone. No database and no server-only import, so the seed can use it.

const clocks = new Map<string, Intl.DateTimeFormat>()

// The wall-clock reading in `timeZone` at `at`; month is 0-based.
export function wallClock(timeZone: string, at: Date) {
  let clock = clocks.get(timeZone)
  if (!clock) {
    clock = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    })
    clocks.set(timeZone, clock)
  }
  const p = Object.fromEntries(clock.formatToParts(at).map((x) => [x.type, Number(x.value)]))
  return { year: p.year, month: p.month - 1, day: p.day, hour: p.hour, minute: p.minute, second: p.second }
}

// The UTC instant of local midnight on (year, month, day) — month is 0-based; month and day may overflow.
export function localMidnight(timeZone: string, year: number, month: number, day: number): Date {
  const wall = Date.UTC(year, month, day)
  let t = wall
  for (let i = 0; i < 2; i++) {
    const w = wallClock(timeZone, new Date(t))
    const offset = Date.UTC(w.year, w.month, w.day, w.hour, w.minute, w.second) - Math.floor(t / 1000) * 1000
    t = wall - offset
  }
  return new Date(t)
}

// The market-local calendar day containing `at`: its local midnight and the next one, as UTC instants.
export function dayBounds(country: Country, at: Date): { start: Date; end: Date } {
  const timeZone = MARKETS[country].timezone
  const { year, month, day } = wallClock(timeZone, at)
  return { start: localMidnight(timeZone, year, month, day), end: localMidnight(timeZone, year, month, day + 1) }
}
