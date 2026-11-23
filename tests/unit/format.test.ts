import { describe, expect, it } from 'vitest'
import { ageLabel, daysLeft, fd, fdt, fmt, hm, initials, isoInZone, loc, localAmount, longDate, maskPhone, pct, usd, usdFromDollars } from '@/lib/format'

describe('prototype formatting', () => {
  it('fmt abbreviates counts', () => {
    expect(fmt(57600)).toBe('57.6k')
    expect(fmt(110000)).toBe('110.0k')
    expect(fmt(1330000)).toBe('1.33M')
    expect(fmt(317)).toBe('317')
  })
  it('usd prints whole dollars whole and anything else to the cent, with a true minus', () => {
    expect(usd(111500)).toBe('$1,115')
    expect(usd(-55700)).toBe('−$557')
    expect(usd(5000)).toBe('$50')
    expect(usd(0)).toBe('$0')
    expect(usd(-0)).toBe('$0')
    // The controller's ruling (Prompt 5): a real ₦50 payout is 3 cents, never "$0".
    expect(usd(3)).toBe('$0.03')
    expect(usd(1250)).toBe('$12.50')
    expect(usd(-3)).toBe('−$0.03')
    expect(usd(123456789)).toBe('$1,234,567.89')
    expect(usdFromDollars(1234.4)).toBe('$1,234.40')
    expect(usdFromDollars(50)).toBe('$50')
    // Dollars are rounded to the cent first: a float a hair off a whole dollar is that dollar.
    expect(usdFromDollars(0.1 + 0.2 + 49.7)).toBe('$50')
    expect(usdFromDollars(0.004)).toBe('$0')
  })
  it('localAmount prints whole local units, grouped, with a true minus', () => {
    expect(localAmount(50, 'NG')).toBe('₦50')
    expect(localAmount(90000, 'NG')).toBe('₦90,000')
    expect(localAmount(1000, 'KE')).toBe('KSh1,000')
    expect(localAmount(-49.6, 'NG')).toBe('−₦50')
    expect(localAmount(-0.4, 'NG')).toBe('₦0')
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

describe('fdt and hm', () => {
  it('is the day, short month and 24-hour time on the wall clock of the zone', () => {
    const at = new Date('2026-11-13T23:42:10Z')
    expect(fdt(at, 'Africa/Lagos')).toBe('14 Nov, 00:42')
    expect(fdt(at, 'Africa/Nairobi')).toBe('14 Nov, 02:42')
    expect(fdt(at, 'Africa/Accra')).toBe('13 Nov, 23:42')
    expect(fdt(new Date('2026-09-03T08:05:00Z'), 'Africa/Lagos')).toBe('3 Sep, 09:05')
  })
  it('hm is the time alone', () => {
    expect(hm(new Date('2026-11-13T23:00:00Z'), 'Africa/Lagos')).toBe('00:00')
    expect(hm(new Date('2026-11-13T09:30:00Z'), 'Africa/Nairobi')).toBe('12:30')
  })
})

describe('the date formatters', () => {
  it('build one Intl.DateTimeFormat per pattern and zone, however many dates they print', () => {
    const Real = Intl.DateTimeFormat
    const zones: (string | undefined)[] = []
    Intl.DateTimeFormat = class extends Real {
      constructor(locale?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions) {
        super(locale, options)
        zones.push(options?.timeZone)
      }
    } as typeof Intl.DateTimeFormat
    try {
      const tz = 'Africa/Kampala'
      for (let i = 0; i < 200; i++) {
        const d = new Date(Date.UTC(2026, 10, 13, 0, i))
        fd(d, tz)
        fdt(d, tz)
        hm(d, tz)
      }
      // fd's pattern and hm's: fdt uses both.
      expect(zones.filter((z) => z === tz)).toHaveLength(2)
      expect(fdt(new Date('2026-11-13T09:05:00Z'), tz)).toBe('13 Nov, 12:05')
    } finally {
      Intl.DateTimeFormat = Real
    }
  })
})
