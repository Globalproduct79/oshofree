import { expect } from 'vitest'

// A refusal as a person reads it: a non-empty sentence from the copy file, never zod's own words ("Invalid input:
// expected number, received NaN", "Too small: …") or the schema's internal refine message.
const SCHEMA_WORDS = /^(Invalid|Too (small|big)|Expected|Unrecognized|Required)\b|\bexpected\b.*\breceived\b|runsForDays|endsAt/

export function expectCopySentence(message: unknown, context?: string) {
  expect(typeof message, context).toBe('string')
  const m = message as string
  expect(m.trim().length, context).toBeGreaterThan(0)
  expect(m, context).toMatch(/[.?]$/)
  expect(m, context).not.toMatch(SCHEMA_WORDS)
}
