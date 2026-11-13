import Link from 'next/link'
import { cn } from '@/lib/utils'
import { tokens } from '@/lib/tokens'

const base =
  'inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-lg border px-4 text-sm font-medium transition-opacity hover:opacity-90'

// A link that looks like the console's buttons; the orange one is the page's primary action.
export function LinkButton({
  href,
  primary,
  className,
  children,
}: {
  href: string
  primary?: boolean
  className?: string
  children: React.ReactNode
}) {
  const style = primary
    ? { backgroundColor: tokens.accent, borderColor: tokens.accent, color: tokens.card }
    : { backgroundColor: tokens.card, borderColor: tokens.line, color: tokens.ink }
  return (
    <Link href={href} className={cn(base, className)} style={style}>
      {children}
    </Link>
  )
}
