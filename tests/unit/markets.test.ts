import { describe, expect, it } from 'vitest'
import { CATEGORIES, COUNTRIES, MARKETS } from '@/lib/markets'

describe('markets', () => {
  it('has Nigeria dialling code 234', () => {
    expect(MARKETS.NG.dial).toBe(234)
  })
  it('has seven categories', () => {
    expect(CATEGORIES.length).toBe(7)
  })
  it('has a market for every country', () => {
    expect(Object.keys(MARKETS).sort()).toEqual([...COUNTRIES].sort())
  })
})
