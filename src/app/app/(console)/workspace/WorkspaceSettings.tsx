'use client'

import { useActionState, useEffect } from 'react'
import { Button } from '@/components/og'
import { toast } from '@/components/shell/toast-store'
import { COPY } from '@/lib/copy'
import { COUNTRIES, MARKETS, type Country } from '@/lib/markets'
import type { FormState } from '../workspace-form'

type Values = { name: string; type: 'Brand' | 'Agency'; country: Country; registrationNumber: string }

export function WorkspaceSettings({
  action,
  initial,
  typeCountryLocked,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>
  initial: Values
  typeCountryLocked: boolean
}) {
  const [state, formAction, pending] = useActionState(action, null)
  useEffect(() => {
    if (state?.saved) toast(COPY.workspace.toastSaved)
  }, [state])
  return (
    <form action={formAction}>
      <label className="f">
        {COPY.workspace.nameLabel}
        <input name="name" defaultValue={initial.name} minLength={2} maxLength={80} required />
      </label>
      <label className="f" style={{ marginTop: 12 }}>
        {COPY.workspace.typeLabel}
        {typeCountryLocked && <small> {COPY.workspace.locked}</small>}
        <select name="type" defaultValue={initial.type} disabled={typeCountryLocked}>
          <option value="Brand">{COPY.workspace.types.Brand}</option>
          <option value="Agency">{COPY.workspace.types.Agency}</option>
        </select>
      </label>
      <label className="f" style={{ marginTop: 12 }}>
        {COPY.workspace.countryLabel}
        {typeCountryLocked && <small> {COPY.workspace.locked}</small>}
        <select name="country" defaultValue={initial.country} disabled={typeCountryLocked}>
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>{`${MARKETS[c].name} · ${MARKETS[c].currency}`}</option>
          ))}
        </select>
      </label>
      <label className="f" style={{ marginTop: 12 }}>
        {COPY.workspace.registrationLabel} <small>{COPY.workspace.registrationHint}</small>
        <input
          name="registrationNumber"
          defaultValue={initial.registrationNumber}
          placeholder={COPY.workspace.registrationPlaceholder}
          maxLength={40}
        />
      </label>
      {state?.error && state.error !== 'LOCKED' && (
        <p role="alert" style={{ marginTop: 12 }}>{state.error}</p>
      )}
      {state?.error === 'LOCKED' && <p role="alert" style={{ marginTop: 12 }}>{COPY.workspace.locked}</p>}
      <Button variant="primary" type="submit" disabled={pending} style={{ marginTop: 14 }}>
        {COPY.workspace.save}
      </Button>
    </form>
  )
}
