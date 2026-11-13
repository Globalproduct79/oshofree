'use client'

import { useFormContext } from 'react-hook-form'
import { Label } from '@/components/ui/label'
import { COPY } from '@/lib/copy'
import { tokens } from '@/lib/tokens'
import type { FieldName, FormValues } from './values'

export const selectClass =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive'

export function Section({ title, wide, children }: { title: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <section
      className="border p-5 sm:p-6"
      style={{ borderRadius: tokens.radius, borderColor: tokens.line, backgroundColor: tokens.card }}
    >
      <h2 className="mb-4 text-base font-semibold" style={{ color: tokens.ink }}>
        {title}
      </h2>
      <div className={`grid gap-4 ${wide ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>{children}</div>
    </section>
  )
}

// Ids, aria wiring and the human message for one field. Zod's own wording never reaches the page.
export function useField(name: FieldName) {
  const { formState } = useFormContext<FormValues>()
  const error = formState.errors[name] ? COPY.campaignForm.errors[name] : undefined
  const id = `cf-${name}`
  return {
    error,
    id,
    a11y: { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': `${id}-msg` },
  }
}

type FieldProps = {
  name: FieldName
  label: string
  hint?: string
  counter?: string
  full?: boolean
  children: React.ReactNode
}

export function Field({ name, label, hint, counter, full, children }: FieldProps) {
  const { error, id } = useField(name)
  return (
    <div className={`flex flex-col gap-1.5 ${full ? 'sm:col-span-full' : ''}`}>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {counter && (
          <span className="text-xs tabular-nums" style={{ color: tokens.ink3 }}>
            {counter}
          </span>
        )}
      </div>
      {children}
      <Message id={`${id}-msg`} error={error} hint={hint} />
    </div>
  )
}

export function Message({ id, error, hint }: { id: string; error?: string; hint?: string }) {
  if (!error && !hint) return null
  return (
    <p id={id} role={error ? 'alert' : undefined} className="text-xs" style={{ color: error ? tokens.red : tokens.ink3 }}>
      {error ?? hint}
    </p>
  )
}
