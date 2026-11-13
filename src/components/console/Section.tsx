import { tokens } from '@/lib/tokens'

// A titled block of a report page; Box is the white card most of them sit in.
export function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold" style={{ color: tokens.ink }}>
          {title}
        </h2>
        {subtitle && (
          <p className="mt-1 text-sm" style={{ color: tokens.ink2 }}>
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </section>
  )
}

export function Box({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`min-w-0 border p-5 ${className}`}
      style={{ borderRadius: tokens.radius, borderColor: tokens.line, backgroundColor: tokens.card }}
    >
      {children}
    </div>
  )
}
