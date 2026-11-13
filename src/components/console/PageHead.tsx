import { tokens } from '@/lib/tokens'

export function PageHead({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-2xl">
        <h1 className="text-[28px] font-semibold leading-tight" style={{ color: tokens.ink }}>
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 text-sm leading-relaxed" style={{ color: tokens.ink2 }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
