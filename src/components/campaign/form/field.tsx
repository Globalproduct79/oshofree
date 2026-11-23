import type { CampaignField, Refusal } from '@/lib/campaign-schema'

// A refused field on the form (Prompt 1 of slice 2): the rule's sentence beside the field it is about, the field
// marked invalid and described by that sentence, and the cursor moved there when the primary is pressed. The one hint
// by the buttons stays (it says why the primary does nothing); this puts the same sentence where the fix is.

export type { CampaignField }

// The refusal the form marks: shown once the person has left that field, or pressed the primary.
export type Marked = Refusal | null

export const fieldId = (field: CampaignField) => `cf-field-${field}`
// The hint beside the primary button: the refusal that keeps it from going on.
export const HINT_ID = 'cf-hint'
const errorId = (field: CampaignField) => `cf-err-${field}`

// The field a focus event came from (its own id, or the group holding it), or null.
export function fieldOf(target: EventTarget | null): CampaignField | null {
  const el = target instanceof Element ? target.closest('[id^="cf-field-"]') : null
  return el ? (el.id.slice('cf-field-'.length) as CampaignField) : null
}

// A control's id and, while it is the refused one, its invalid state and the sentence that describes it: its own
// FieldError, or `describedBy` (the confirmation's is the hint beside the button just below it).
export function fieldProps(field: CampaignField, marked: Marked, describedBy = errorId(field)) {
  const on = marked?.field === field
  return { id: fieldId(field), 'aria-invalid': on || undefined, 'aria-describedby': on ? describedBy : undefined }
}

// The sentence under the refused field. Inside a label it is hidden from the label's name (the control reads it as
// its description instead); `spoken` leaves it readable where no control points at it (the creative picker).
export function FieldError({ field, marked, spoken }: { field: CampaignField; marked: Marked; spoken?: boolean }) {
  if (marked?.field !== field) return null
  return (
    <span className="ferr" id={errorId(field)} aria-hidden={spoken ? undefined : true}>
      {marked.message}
    </span>
  )
}

// Brings the field into the middle of the screen and puts the cursor on it: the control itself, or in a group the
// chosen option (a swatch, a placement tile), else the picker's zone, else the first control. False when the field
// is not on the page.
export function focusField(field: CampaignField): boolean {
  const box = typeof document === 'undefined' ? null : document.getElementById(fieldId(field))
  if (!box) return false
  const target = box.matches('input,select,textarea,button')
    ? box
    : (box.querySelector<HTMLElement>('[aria-pressed="true"],[role="button"],button,input:not([type="file"]),select,textarea') ?? box)
  target.scrollIntoView?.({ block: 'center' })
  target.focus({ preventScroll: true })
  return true
}
