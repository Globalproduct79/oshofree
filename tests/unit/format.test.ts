import { describe, expect, it } from 'vitest'
import { daysLeft, fd, fmt, initials, loc, maskPhone, pct, usd, usdFromDollars } from '@/lib/format'

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
