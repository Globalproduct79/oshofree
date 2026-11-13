'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { COPY } from '@/lib/copy'
import { COUNTRIES, MARKETS, type Country } from '@/lib/markets'

export type FormState = { error?: string; saved?: boolean } | null
type Values = { name: string; type: 'Brand' | 'Agency'; country: Country }

const selectClass =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

export function WorkspaceForm({
  action,
  submitLabel,
  initial,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>
  submitLabel: string
  initial?: Values
}) {
  const [state, formAction, pending] = useActionState(action, null)
  return (
    <form action={formAction} className="flex max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">{COPY.workspace.nameLabel}</Label>
        <Input id="name" name="name" defaultValue={initial?.name} minLength={2} maxLength={80} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="type">{COPY.workspace.typeLabel}</Label>
        <select id="type" name="type" defaultValue={initial?.type ?? 'Brand'} className={selectClass}>
          <option value="Brand">{COPY.workspace.types.Brand}</option>
          <option value="Agency">{COPY.workspace.types.Agency}</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="country">{COPY.workspace.countryLabel}</Label>
        <select id="country" name="country" defaultValue={initial?.country ?? 'NG'} className={selectClass}>
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>{MARKETS[c].name}</option>
          ))}
        </select>
      </div>
      {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      {state?.saved && <p role="status" className="text-sm text-muted-foreground">{COPY.workspace.saved}</p>}
      <Button type="submit" disabled={pending}>{submitLabel}</Button>
    </form>
  )
}
