'use client'

import type { ComponentProps } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from './Button'

// What a submit button carries while its form is (or is not) on its way: off from the press until the action
// answers, so a slow server never takes a second press, and busy for assistive tech meanwhile.
export function pendingState(pending: boolean, disabled: boolean | undefined) {
  return { type: 'submit' as const, disabled: Boolean(disabled) || pending, 'aria-busy': pending || undefined }
}

type Props = ComponentProps<typeof Button> & {
  // Keeps the caller's own look (a switcher row, the banner's underlined button, the auth cards' button classes)
  // instead of the og button's.
  plain?: boolean
}

// A form's submit (Prompt 10). Inside a <form action={…}>, it reads the form's status: pending, it is off and dimmed
// with the progress cursor (`.btn[aria-busy]`, `button[aria-busy]` in console.css).
export function SubmitButton({ plain, disabled, variant, size, danger, ...props }: Props) {
  const { pending } = useFormStatus()
  const state = pendingState(pending, disabled)
  return plain ? <button {...props} {...state} /> : <Button variant={variant} size={size} danger={danger} {...props} {...state} />
}
