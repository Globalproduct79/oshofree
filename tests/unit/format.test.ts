import { describe, expect, it } from 'vitest'
import { ageLabel, daysLeft, fd, fmt, initials, isoInZone, loc, longDate, maskPhone, pct, usd, usdFromDollars } from '@/lib/format'

describe('prototype formatting', () => {
  it('fmt abbreviates counts', () => {
    expect(fmt(57600)).toBe('57.6k')
    expect(fmt(110000)).toBe('110.0k')
    expect(fmt(1330000)).toBe('1.33M')
    expect(fmt(317)).toBe('317')
  })
  it('usd rounds to whole dollars with a true minus', () => {
    expect(usd(111500)).toBe('$1,115')
    expect(usd(-55700)).toBe('−$557')
    expect(usdFromDollars(1234.4)).toBe('$1,234')
  })
  it('loc converts and rounds in local currency', () => {
    expect(loc(30000, 'NG', 1550)).toBe('₦465,000')
    expect(loc(-11800, 'NG', 1550)).toBe('−₦182,900')
    expect(loc(10000, 'GH', 15)).toBe('GH₵1,500')
  })
  it('pct', () => {
    expect(pct(3, 0)).toBe('0%')
    expect(pct(61, 1000)).toBe('6.1%')
  })
  it('fd prints day and month in the zone', () => {
    expect(fd(new Date('2026-11-16T12:00Z'), 'Africa/Lagos')).toBe('16 Nov')
    expect(fd(new Date('2026-11-16T23:30Z'), 'Africa/Lagos')).toBe('17 Nov')
  })
  it('daysLeft rounds up and floors at 0', () => {
    const now = new Date('2026-11-13T00:00:00Z')
    expect(daysLeft(new Date('2026-11-15T06:00:00Z'), now)).toBe(3)
    expect(daysLeft(new Date('2026-11-01T00:00:00Z'), now)).toBe(0)
  })
  it('initials', () => {
    expect(initials('MediaSpec (agency)')).toBe('M')
    expect(initials('Kola Bright')).toBe('KB')
    expect(initials('777Bet')).toBe('7B')
  })
  it('maskPhone', () => {
    expect(maskPhone('+2348012344471')).toBe('+234 80• ••• 4471')
    expect(maskPhone('+254712345678')).toBe('+254 71• ••• 5678')
    expect(maskPhone('+441234567890')).toBe('+441 23• ••• 7890')
  })
})

describe('longDate', () => {
  it('is the day, short month and year on the wall clock of the zone, with Sep for September', () => {
    expect(longDate(new Date('2026-11-16T12:00Z'), 'Africa/Lagos')).toBe('16 Nov 2026')
    expect(longDate(new Date('2026-12-31T23:30Z'), 'Africa/Nairobi')).toBe('1 Jan 2027')
    expect(longDate(new Date('2026-09-03T10:00Z'), 'Africa/Lagos')).toBe('3 Sep 2026')
  })
})

describe('ageLabel', () => {
  const now = new Date('2026-11-13T12:00:00Z')
  const ago = (ms: number) => new Date(now.getTime() - ms)
  it('says now under a minute, then minutes, hours and days', () => {
    expect(ageLabel(ago(0), now)).toBe('now')
    expect(ageLabel(ago(59_000), now)).toBe('now')
    expect(ageLabel(ago(60_000), now)).toBe('1m ago')
    expect(ageLabel(ago(59 * 60_000), now)).toBe('59m ago')
    expect(ageLabel(ago(2 * 3_600_000), now)).toBe('2h ago')
    expect(ageLabel(ago(23 * 3_600_000 + 59 * 60_000), now)).toBe('23h ago')
    expect(ageLabel(ago(24 * 3_600_000), now)).toBe('1d ago')
    expect(ageLabel(ago(9 * 86_400_000), now)).toBe('9d ago')
  })
  it('treats a future date as now', () => expect(ageLabel(new Date(now.getTime() + 5_000), now)).toBe('now'))
})

describe('isoInZone', () => {
  it("writes the instant on the market's wall clock with its offset", () => {
    const at = new Date('2026-11-16T21:00:00Z')
    expect(isoInZone(at, 'Africa/Nairobi')).toBe('2026-11-17T00:00:00+03:00')
    expect(isoInZone(at, 'Africa/Lagos')).toBe('2026-11-16T22:00:00+01:00')
    expect(isoInZone(at, 'Africa/Accra')).toBe('2026-11-16T21:00:00+00:00')
    for (const tz of ['Africa/Nairobi', 'Africa/Lagos', 'Africa/Dakar']) expect(new Date(isoInZone(at, tz))).toEqual(at)
  })
})
