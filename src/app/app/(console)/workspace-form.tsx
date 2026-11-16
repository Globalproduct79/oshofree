'use client'

import { useActionState } from 'react'
import { SubmitButton } from '@/components/og'
import { COPY } from '@/lib/copy'
import { COUNTRIES, MARKETS, type Country } from '@/lib/markets'

export type FormState = { error?: string; saved?: boolean } | null
type Values = { name: string; type: 'Brand' | 'Agency'; country: Country }

// The new-workspace form, in the console's fields and buttons: the name across the box, type and country side by
// side (one column at phone width).
export function WorkspaceForm({
  action,
  submitLabel,
  initial,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>
  submitLabel: string
  initial?: Values
}) {
  const [state, formAction] = useActionState(action, null)
  return (
    <form action={formAction} className="form">
      <label className="f full">
        {COPY.workspace.nameLabel}
        <input name="name" defaultValue={initial?.name} minLength={2} maxLength={80} required />
      </label>
      <label className="f">
        {COPY.workspace.typeLabel}
        <select name="type" defaultValue={initial?.type ?? 'Brand'}>
          <option value="Brand">{COPY.workspace.types.Brand}</option>
          <option value="Agency">{COPY.workspace.types.Agency}</option>
        </select>
      </label>
      <label className="f">
        {COPY.workspace.countryLabel}
        <select name="country" defaultValue={initial?.country ?? 'NG'}>
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {MARKETS[c].name}
            </option>
          ))}
        </select>
      </label>
      {state?.error && (
        <p role="alert" className="warn full">
          {state.error}
        </p>
      )}
      {state?.saved && <p role="status" className="full">{COPY.workspace.saved}</p>}
      <div className="btns full">
        <SubmitButton variant="primary">{submitLabel}</SubmitButton>
      </div>
    </form>
  )
}
