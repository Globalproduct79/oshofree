'use client'

import { useTransition } from 'react'
import { Button, type ButtonSize, type ButtonVariant } from '@/components/og'
import { toast } from '@/components/shell/toast-store'

// Platform's inline controls (GLB §2.2's credit-limit field, the Rates inputs): each runs a server action bound
// to its target and toasts the answer — what was done, or why nothing was.
export type ActionResult = { toast: string } | { error: string }

const say = (res: ActionResult | void) => {
  if (res) toast('toast' in res ? res.toast : res.error)
  return !!res && 'toast' in res
}

export const fieldStyle = { border: '1px solid var(--line)', borderRadius: 7, padding: '6px 8px', background: 'var(--card)' }

// Saves when committed, as the prototype's native `change` event: on blur or Enter, and only when the value
// changed. The page redraws with what was saved (the key remounts the field); a refusal puts the old value back.
export function CommitInput({
  value,
  save,
  label,
  type = 'text',
  width = 96,
}: {
  value: string
  save: (value: string | number) => Promise<ActionResult>
  label: string
  type?: 'text' | 'dollars'
  width?: number
}) {
  const [pending, start] = useTransition()
  const dollars = type === 'dollars'
  return (
    <input
      key={value}
      type={dollars ? 'number' : 'text'}
      step={dollars ? 100 : undefined}
      min={dollars ? 0 : undefined}
      aria-label={label}
      defaultValue={value}
      disabled={pending}
      style={{ ...fieldStyle, width, maxWidth: '100%' }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
      onBlur={(e) => {
        const el = e.currentTarget
        if (el.value === el.defaultValue) return
        start(async () => {
          if (!say(await save(dollars ? el.valueAsNumber : el.value))) el.value = el.defaultValue
        })
      }}
    />
  )
}

// Saves on pick; a refusal puts the old choice back.
export function CommitSelect({
  value,
  options,
  save,
  label,
}: {
  value: string
  options: readonly { value: string; label: string }[]
  save: (value: string) => Promise<ActionResult>
  label: string
}) {
  const [pending, start] = useTransition()
  return (
    <select
      key={value}
      aria-label={label}
      defaultValue={value}
      disabled={pending}
      style={{ ...fieldStyle, maxWidth: '100%' }}
      onChange={(e) => {
        const el = e.currentTarget
        start(async () => {
          if (!say(await save(el.value))) el.value = value
        })
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

// A button that runs its action once per click and toasts the answer. An action that navigates (entering a
// workspace) answers nothing.
export function ActionButton({
  act,
  variant = 'ghost',
  size,
  children,
}: {
  act: () => Promise<ActionResult | void>
  variant?: ButtonVariant
  size?: ButtonSize
  children: React.ReactNode
}) {
  const [pending, start] = useTransition()
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={pending}
      style={{ whiteSpace: 'nowrap' }}
      onClick={() =>
        start(async () => {
          say(await act())
        })
      }
    >
      {children}
    </Button>
  )
}
