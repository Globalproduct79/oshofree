// Numbers and dates the console prints. UTC dates so the server and the browser print the same day.

const numbers = new Intl.NumberFormat('en-GB')
const days = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

export const num = (n: number) => numbers.format(n)

export const shortDate = (d: Date) => days.format(d)

// ---- Prototype formatting: counts, money (integer USD cents), dates, initials, phones. ----

import { MARKETS, type Country } from './markets'

const MINUS = '−'
const grouped = new Intl.NumberFormat('en-US')
const toTheCent = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// 57600 → '57.6k', 1330000 → '1.33M', 317 → '317'
export const fmt = (n: number): string => {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (abs >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(Math.round(n))
}

const money = (symbol: string, whole: number): string => {
  const body = `${symbol}${grouped.format(Math.abs(whole))}`
  return whole < 0 ? MINUS + body : body
}

// The controller's ruling (Prompt 5): whole dollars print whole ('$50', '$1,115'); anything else prints to the
// cent ('$0.03', '$12.50'), so a real ₦50 payout never reads "$0". Rounded to the cent (half away from zero) first.
export const usd = (cents: number): string => {
  const c = Math.round(Math.abs(cents)) * Math.sign(cents)
  if (c === 0) return '$0'
  if (c % 100 === 0) return money('$', c / 100)
  const body = `$${toTheCent.format(Math.abs(c) / 100)}`
  return c < 0 ? MINUS + body : body
}

export const usdFromDollars = (n: number): string => usd(n * 100)

// An amount already in the market's currency, whole units: 50 → '₦50', 1000 → '₦1,000', 'KSh10'.
export const localAmount = (whole: number, country: Country): string => {
  const n = Math.round(whole)
  return money(MARKETS[country].symbol, n === 0 ? 0 : n)
}

export const loc = (cents: number, country: Country, fxPerUsd: number): string => localAmount((cents / 100) * fxPerUsd, country)

export const pct = (a: number, b: number): string => (b === 0 ? '0%' : ((a / b) * 100).toFixed(1) + '%')

// One formatter per pattern and zone, made on first use and kept: a page of dated lines formats every line with the
// same few (building an Intl.DateTimeFormat costs far more than using one).
const PATTERNS = {
  day: ['en-GB', { day: 'numeric', month: 'short' }],
  year: ['en-GB', { day: 'numeric', month: 'short', year: 'numeric' }],
  time: ['en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }],
  hour: ['en-GB', { hour: 'numeric', hourCycle: 'h23' }],
  iso: ['en-US', { hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }],
} as const satisfies Record<string, readonly [string, Intl.DateTimeFormatOptions]>
const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(pattern: keyof typeof PATTERNS, tz: string): Intl.DateTimeFormat {
  const key = `${pattern}|${tz}`
  let f = formatters.get(key)
  if (!f) {
    const [locale, options] = PATTERNS[pattern]
    f = new Intl.DateTimeFormat(locale, { ...options, timeZone: tz })
    formatters.set(key, f)
  }
  return f
}

export const fd = (d: Date, tz: string): string => formatter('day', tz).format(d)

// The 24-hour time on the wall clock of `tz`: '09:05'.
export const hm = (d: Date, tz: string): string => formatter('time', tz).format(d)

// fd with the time, for an event: '14 Nov, 09:05' (en-GB's 'Sept' read as 'Sep').
export const fdt = (d: Date, tz: string): string => `${fd(d, tz).replace(/\bSept\b/, 'Sep')}, ${hm(d, tz)}`

// fd with the year, for a date that may be in another year: '3 Sep 2026' (en-GB's 'Sept' read as 'Sep').
export const longDate = (d: Date, tz: string): string => formatter('year', tz).format(d).replace(/\bSept\b/, 'Sep')

// An instant as ISO 8601 on the wall clock of `tz`, with that zone's offset: 2026-11-17T00:00:00+03:00.
// Whole seconds; the instant is unchanged, so new Date() of the result is the same moment.
export function isoInZone(d: Date, tz: string): string {
  const parts = formatter('iso', tz).formatToParts(d)
  const p = (t: Intl.DateTimeFormatPartTypes) => parts.find((x) => x.type === t)!.value
  const wall = Date.UTC(+p('year'), +p('month') - 1, +p('day'), +p('hour'), +p('minute'), +p('second'))
  const offset = Math.round((wall - Math.floor(d.getTime() / 1000) * 1000) / 60_000)
  const abs = Math.abs(offset)
  const hhmm = `${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
  return `${p('year')}-${p('month')}-${p('day')}T${p('hour')}:${p('minute')}:${p('second')}${offset < 0 ? '-' : '+'}${hhmm}`
}

// The hour of the day (0–23) on the wall clock in `tz`.
export const hourIn = (d: Date, tz: string): number =>
  Number(
    formatter('hour', tz)
      .formatToParts(d)
      .find((p) => p.type === 'hour')?.value,
  )

export const daysLeft = (end: Date, now: Date): number =>
  Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86_400_000))

// First character of each word, where a digit run and a letter run in one word count separately
// ('777Bet' → '7B'). A parenthesised suffix and punctuation are ignored.
export const initials = (name: string): string =>
  name
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .flatMap((w) => w.match(/\p{N}+|\p{L}+/gu) ?? [])
    .map((seg) => seg[0].toUpperCase())
    .join('')

// '+2348012344471' → '+234 80• ••• 4471'
export const maskPhone = (e164: string): string => {
  const digits = e164.replace(/\D/g, '')
  const known = Object.values(MARKETS)
    .map((m) => String(m.dial))
    .find((d) => digits.startsWith(d))
  const code = known ?? digits.slice(0, 3)
  const rest = digits.slice(code.length)
  return `+${code} ${rest.slice(0, 2)}• ••• ${digits.slice(-4)}`
}

// How long ago, for the bell: 'now' under a minute, then '5m ago', '2h ago', '9d ago'.
export const ageLabel = (at: Date, now: Date): string => {
  const s = Math.floor((now.getTime() - at.getTime()) / 1000)
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86_400)}d ago`
}
