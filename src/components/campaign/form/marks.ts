import type { CampaignField, Refusal } from '@/lib/campaign-schema'

// Which refused field the form marks (slice 2, Prompt 1 and its review). Pure, so the rules can be tested without a
// DOM. A field is marked once the person has left it, or when they pressed the primary while it was the one refused;
// the next field is never marked ahead of them.

export type Marks = { touched: ReadonlySet<CampaignField>; pressed: CampaignField | null }
export const NO_MARKS: Marks = { touched: new Set(), pressed: null }

// The refusal to mark now, or null.
export function markedOf(problem: Refusal | null, m: Marks): Refusal | null {
  return problem?.field && (problem.field === m.pressed || m.touched.has(problem.field)) ? problem : null
}

// The person left `field`.
export const left = (m: Marks, field: CampaignField): Marks =>
  m.touched.has(field) ? m : { ...m, touched: new Set(m.touched).add(field) }

// The primary was pressed while `problem` stood.
export const pressedOn = (m: Marks, problem: Refusal): Marks => ({ ...m, pressed: problem.field })

// On to the Review step: a press on the edit step is behind them.
export const toReview = (m: Marks): Marks => ({ ...m, pressed: null })

// Back to the edit step (Back, an Edit, or a refusal whose field is only there). The confirmation is asked for afresh
// on the next Review, so having left it before no longer counts. `refused` is the field a press sent them back for,
// marked at once.
export function backToEdit(m: Marks, refused: CampaignField | null = null): Marks {
  const touched = new Set(m.touched)
  touched.delete('termsAccepted')
  return { touched, pressed: refused }
}

// What a press does with a refusal: the cursor goes to its field where it is on the page; on the Review step a field
// that is not there (the market's day turned while it was open) means going back to the edit step for it; otherwise
// the hint beside the button says why.
export function pressOutcome(field: CampaignField | null, focused: boolean, reviewing: boolean): 'focused' | 'back' | 'hint' {
  if (focused) return 'focused'
  return field && reviewing ? 'back' : 'hint'
}
