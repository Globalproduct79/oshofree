import Link from '@/components/og/Link'
import type { ComponentProps } from 'react'
import { tokens } from '@/lib/tokens'

export type ButtonVariant = 'primary' | 'dark' | 'ghost' | 'default'
export type ButtonSize = 's' | 'lg'
type Look = { variant?: ButtonVariant; size?: ButtonSize; danger?: boolean }

const VARIANT: Record<ButtonVariant, string | null> = { primary: 'p', dark: 'd', ghost: 'g', default: null }

// `.btn` + `.p` / `.d` / `.g` + `.s` / `.lg` (GLB §6.5). Danger is the ghost button with red text;
// the prototype has no red-filled button.
export function btnClass({ variant = 'default', size, danger }: Look, className?: string) {
  return ['btn', VARIANT[danger ? 'ghost' : variant], size, className].filter(Boolean).join(' ')
}

const dangerStyle = (danger: boolean | undefined, style: React.CSSProperties | undefined) =>
  danger ? { color: tokens.red, ...style } : style

export function Button({ variant, size, danger, className, style, ...props }: ComponentProps<'button'> & Look) {
  return <button className={btnClass({ variant, size, danger }, className)} style={dangerStyle(danger, style)} {...props} />
}

// A Next link that looks like a Button.
export function LinkButton({ variant, size, danger, className, style, ...props }: ComponentProps<typeof Link> & Look) {
  return <Link className={btnClass({ variant, size, danger }, className)} style={dangerStyle(danger, style)} {...props} />
}
