import { describe, expect, it } from 'vitest'
import { backToEdit, left, markedOf, NO_MARKS, pressedOn, pressOutcome, toReview } from '@/components/campaign/form/marks'
import { afterRefusal } from '@/components/campaign/form/problem'
import { newCampaignDefaults } from '@/components/campaign/form/values'
import type { Refusal } from '@/lib/campaign-schema'

// Which refused field the New campaign form marks (red edge, aria-invalid, the sentence under it), and what a press
// of the primary does with a refusal.

const name: Refusal = { field: 'name', message: 'Give the campaign a name.' }
const headline: Refusal = { field: 'headline', message: 'Write the offer headline.' }
const terms: Refusal = { field: 'termsAccepted', message: 'Confirm the offer is genuine.' }
const noRate: Refusal = { field: null, message: 'No rate is set for this placement in Nigeria yet. Ask Global.' }

describe('markedOf', () => {
  it('marks nothing on a fresh form', () => {
    expect(markedOf(name, NO_MARKS)).toBeNull()
    expect(markedOf(null, NO_MARKS)).toBeNull()
  })

  it('marks a field the person has left, and one refused when they pressed', () => {
    expect(markedOf(name, left(NO_MARKS, 'name'))).toBe(name)
    expect(markedOf(name, pressedOn(NO_MARKS, name))).toBe(name)
  })

  it('never marks the next field ahead of them: fixing the pressed one leaves the next unmarked', () => {
    const m = pressedOn(NO_MARKS, name)
    expect(markedOf(headline, m)).toBeNull()
    expect(markedOf(headline, left(m, 'headline'))).toBe(headline)
  })

  it('marks nothing for a refusal no field fixes (the hint says it)', () => {
    expect(markedOf(noRate, pressedOn(NO_MARKS, noRate))).toBeNull()
  })

  it('leaving a field twice changes nothing', () => {
    const m = left(NO_MARKS, 'name')
    expect(left(m, 'name')).toBe(m)
  })
})

describe('moving between the steps', () => {
  it('opening Review forgets the press on the edit step', () => {
    expect(markedOf(terms, toReview(pressedOn(NO_MARKS, name)))).toBeNull()
  })

  it('Back or an Edit after the confirmation was ticked and left: the reopened Review does not mark it', () => {
    const ticked = left(toReview(NO_MARKS), 'termsAccepted')
    expect(markedOf(terms, ticked)).toBe(terms)
    const back = backToEdit(ticked)
    expect(markedOf(terms, toReview(back))).toBeNull()
    // Fields left on the edit step stay left.
    expect(markedOf(name, backToEdit(left(ticked, 'name')))).toBe(name)
  })

  it('a press on Review refused for a field only the edit step has goes back with that field marked', () => {
    const past: Refusal = { field: 'startsAt', message: "Start date can't be in the past." }
    expect(markedOf(past, backToEdit(pressedOn(NO_MARKS, past), 'startsAt'))).toBe(past)
  })

  it('Start over is a fresh form: nothing left, nothing pressed', () => {
    expect(NO_MARKS).toEqual({ touched: new Set(), pressed: null })
  })
})

describe('pressOutcome', () => {
  it('the cursor goes to the field where it is on the page', () => {
    expect(pressOutcome('name', true, false)).toBe('focused')
    expect(pressOutcome('termsAccepted', true, true)).toBe('focused')
  })
  it("on Review, a field that is not on the page means going back to the edit step for it", () => {
    expect(pressOutcome('startsAt', false, true)).toBe('back')
  })
  it('otherwise the hint says why: no field, or a field that cannot take the cursor on the one-page Edit offer', () => {
    expect(pressOutcome(null, false, true)).toBe('hint')
    expect(pressOutcome('country', false, false)).toBe('hint')
  })
})

describe("afterRefusal: the server's refusal on the form", () => {
  const values = {
    ...newCampaignDefaults({ name: 'Kola Bright', type: 'Brand', country: 'NG' }),
    placement: 'video' as const,
    creative: { key: '0f8fad5b-d9cb-469f-a165-70867728950e.mp4', kind: 'video' as const, url: '/uploads/x.mp4' },
  }
  const gone = { error: "The creative's file is no longer stored. Attach it again.", field: 'creative' as const, creativeGone: true as const }

  it('a creative whose file is gone comes off, and the creative field is marked with the sentence', () => {
    const next = afterRefusal(values, gone)
    expect(next.values).toEqual({ ...values, creative: null })
    expect(next.notice).toEqual({ field: 'creative', message: gone.error })
    // Marked whatever the form's own marks say: the form falls back to the notice when its rules mark nothing.
    expect(markedOf(null, NO_MARKS) ?? next.notice).toEqual({ field: 'creative', message: gone.error })
  })

  it('any other refusal leaves the values as they are and names no field (the hint by the buttons says it)', () => {
    const next = afterRefusal(values, { error: 'No exchange rate is set for Nigeria yet. Ask Global.' })
    expect(next.values).toBe(values)
    expect(next.notice).toEqual({ field: null, message: 'No exchange rate is set for Nigeria yet. Ask Global.' })
  })
})
