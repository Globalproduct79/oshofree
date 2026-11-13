import { describe, expect, it } from 'vitest'
import { tokens } from '@/lib/tokens'

describe('tokens', () => {
  it('exposes the accent colour', () => {
    expect(tokens.accent).toBe('#FF5A1F')
  })
  it('has seven tile colours', () => {
    expect(tokens.tileColors).toHaveLength(7)
  })
})
