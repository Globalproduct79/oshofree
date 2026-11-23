'use client'

import { useActionState, useEffect } from 'react'
import { SubmitButton } from '@/components/og'
import { toast } from '@/components/shell/toast-store'
import { COPY } from '@/lib/copy'
import { COUNTRIES, MARKETS, type Country } from '@/lib/markets'
import type { FormState } from '../workspace-form'

type Values = { name: string; type: 'Brand' | 'Agency'; country: Country; registrationNumber: string }
const W = COPY.workspace

// The details form: the name across, type and billing country side by side (one column at phone width), the
// registration number across, then Save at the start of its row. Owner and Global save; a Manager or Viewer sees the
// same fields read-only, with no Save and one line saying who can change them. Type and country lock once the
// workspace is approved (Global can still change them): the fields read as locked, with one hint under the pair.
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
    if (state?.saved) toast(W.toastSaved)
  }, [state])
  const lockedPair = readOnly || typeCountryLocked
  return (
    <form action={formAction} className="form">
      <label className="f full">
        {W.nameLabel}
        <input name="name" defaultValue={initial.name} minLength={2} maxLength={80} required readOnly={readOnly} />
      </label>
      <label className="f">
        {W.typeLabel}
        <select name="type" defaultValue={initial.type} disabled={lockedPair}>
          <option value="Brand">{W.types.Brand}</option>
          <option value="Agency">{W.types.Agency}</option>
        </select>
      </label>
      <label className="f">
        {W.countryLabel}
        <select name="country" defaultValue={initial.country} disabled={lockedPair}>
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>{`${MARKETS[c].name} · ${MARKETS[c].currency}`}</option>
          ))}
        </select>
        {!readOnly && typeCountryLocked && <small className="hint">{W.lockedHint}</small>}
      </label>
      <label className="f full">
        {W.registrationLabel} <small>{W.registrationHint}</small>
        <input
          name="registrationNumber"
          defaultValue={initial.registrationNumber}
          placeholder={W.registrationPlaceholder}
          maxLength={40}
          readOnly={readOnly}
        />
      </label>
      {state?.error && state.error !== 'LOCKED' && <p role="alert" className="warn full">{state.error}</p>}
      {state?.error === 'LOCKED' && <p role="alert" className="warn full">{W.locked}</p>}
      {readOnly ? (
        <p className="sub full">{W.ownerOnly}</p>
      ) : (
        <div className="btns full">
          <SubmitButton variant="primary">{W.save}</SubmitButton>
        </div>
      )}
    </form>
  )
}
