// Numbers and dates the console prints. UTC dates so the server and the browser print the same day.

const numbers = new Intl.NumberFormat('en-GB')
const days = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

export const num = (n: number) => numbers.format(n)

// 'YYYY-MM-DD' → '13 Nov'
export const dayLabel = (ymd: string) => days.format(new Date(`${ymd}T00:00:00Z`))

export const shortDate = (d: Date) => days.format(d)

// ---- Prototype formatting: counts, money (integer USD cents), dates, initials, phones. ----

import { MARKETS, type Country } from './markets'

const MINUS = '−'
const grouped = new Intl.NumberFormat('en-US')

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

export const usdFromDollars = (n: number): string => {
  const whole = Math.round(n)
  return money('$', whole === 0 ? 0 : whole)
}

export const usd = (cents: number): string => usdFromDollars(cents / 100)

export const loc = (cents: number, country: Country, fxPerUsd: number): string => {
  const whole = Math.round((cents / 100) * fxPerUsd)
  return money(MARKETS[country].symbol, whole === 0 ? 0 : whole)
}

export const pct = (a: number, b: number): string => (b === 0 ? '0%' : ((a / b) * 100).toFixed(1) + '%')

export const fd = (d: Date, tz: string): string =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: tz }).format(d)

// The hour of the day (0–23) on the wall clock in `tz`.
export const hourIn = (d: Date, tz: string): number =>
  Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: tz })
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
