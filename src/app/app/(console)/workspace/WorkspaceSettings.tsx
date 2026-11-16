'use client'

import { useActionState, useEffect } from 'react'
import { SubmitButton } from '@/components/og'
import { toast } from '@/components/shell/toast-store'
import { COPY } from '@/lib/copy'
import { COUNTRIES, MARKETS, type Country } from '@/lib/markets'
import type { FormState } from '../workspace-form'

type Values = { name: string; type: 'Brand' | 'Agency'; country: Country; registrationNumber: string }

// Owner and Global save; a Manager or Viewer sees the same fields read-only, with no Save.
export function WorkspaceSettings({
  action,
  initial,
  readOnly,
  typeCountryLocked,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>
  initial: Values
  readOnly: boolean
  typeCountryLocked: boolean
}) {
  const [state, formAction] = useActionState(action, null)
  useEffect(() => {
    if (state?.saved) toast(COPY.workspace.toastSaved)
  }, [state])
  return (
    <form action={formAction} className="stack">
      <label className="f">
        {COPY.workspace.nameLabel}
        <input name="name" defaultValue={initial.name} minLength={2} maxLength={80} required readOnly={readOnly} />
      </label>
      <label className="f">
        {COPY.workspace.typeLabel}
        {typeCountryLocked && <small> {COPY.workspace.locked}</small>}
        <select name="type" defaultValue={initial.type} disabled={readOnly || typeCountryLocked}>
          <option value="Brand">{COPY.workspace.types.Brand}</option>
          <option value="Agency">{COPY.workspace.types.Agency}</option>
        </select>
      </label>
      <label className="f">
        {COPY.workspace.countryLabel}
        {typeCountryLocked && <small> {COPY.workspace.locked}</small>}
        <select name="country" defaultValue={initial.country} disabled={readOnly || typeCountryLocked}>
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>{`${MARKETS[c].name} · ${MARKETS[c].currency}`}</option>
          ))}
        </select>
      </label>
      <label className="f">
        {COPY.workspace.registrationLabel} <small>{COPY.workspace.registrationHint}</small>
        <input
          name="registrationNumber"
          defaultValue={initial.registrationNumber}
          placeholder={COPY.workspace.registrationPlaceholder}
          maxLength={40}
          readOnly={readOnly}
        />
      </label>
      {state?.error && state.error !== 'LOCKED' && (
        <p role="alert">{state.error}</p>
      )}
      {state?.error === 'LOCKED' && <p role="alert">{COPY.workspace.locked}</p>}
      {!readOnly && (
        <div className="btns">
          <SubmitButton variant="primary">{COPY.workspace.save}</SubmitButton>
        </div>
      )}
    </form>
  )
}
