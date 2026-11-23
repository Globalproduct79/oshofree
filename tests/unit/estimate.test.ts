import { describe, expect, it } from 'vitest'
import { creditAfterCents, estimate } from '@/lib/estimate'
import { fmt, loc, usd } from '@/lib/format'

const kola = { budgetUsd: 300, placement: 'card', cpmCents: 120, rewardLocal: 50, fxPerUsd: 1550, days: 14 } as const

describe('estimate: the Kola Bright defaults', () => {
  const e = estimate(kola)
  it('impressions come from the budget less the rewards cap', () => {
    expect(e.impressions).toBe(200_000)
    expect(fmt(e.impressions)).toBe('200.0k')
  })
  it('a day, and opens', () => {
    expect(fmt(e.perDay)).toBe('14.3k')
    expect(e.opens).toBeCloseTo(7200, 6)
    expect(`~${fmt(e.opens)}`).toBe('~7.2k')
  })
  it('successful shares and their reward', () => {
    expect(e.successfulShares).toBeCloseTo(427.68, 2)
    expect(fmt(e.successfulShares)).toBe('428')
    expect(e.rewardCents).toBe(1380)
    expect(usd(e.rewardCents)).toBe('$13.80')
  })
  it('cap and budget in both currencies', () => {
    expect(e.capCents).toBe(6000)
    expect(e.budgetCents).toBe(30_000)
    expect(e.budgetLocal).toBe(465_000)
    expect(loc(e.budgetCents, 'NG', 1550)).toBe('₦465,000')
    expect(usd(e.budgetCents)).toBe('$300')
  })
  it('Credit after for Kola ($702 in use of $1,500) is $498 left', () => {
    expect(usd(creditAfterCents(150_000, 70_200, e.budgetCents))).toBe('$498')
  })
})

describe('estimate: caps and credit', () => {
  it('the cap binds the reward when a share pays more than the cap holds', () => {
    const e = estimate({ ...kola, rewardLocal: 100_000 })
    expect(e.rewardCents).toBe(e.capCents)
  })
  it('a different cap percentage changes impressions', () => {
    expect(estimate({ ...kola, capPct: 10 }).impressions).toBe(225_000)
  })
  it('uses each placement open rate', () => {
    expect(estimate({ ...kola, placement: 'splash' }).opens).toBeCloseTo(18_000, 6)
  })
  it('credit after goes negative over the limit', () => {
    expect(creditAfterCents(150_000, 240_000, 30_000)).toBe(-120_000)
    expect(usd(creditAfterCents(150_000, 240_000, 30_000))).toBe('−$1,200')
  })
  it('an edit counts only the budget increase', () => {
    expect(creditAfterCents(150_000, 70_000, 30_000, true, 25_000)).toBe(75_000)
    expect(creditAfterCents(150_000, 70_000, 20_000, true, 25_000)).toBe(80_000)
  })
})
