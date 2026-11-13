import { tokens } from '@/lib/tokens'

export function NumberTile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div
      className="rounded-[var(--tile-radius)] border p-5"
      style={{
        ['--tile-radius' as string]: tokens.radius,
        backgroundColor: tokens.card,
        borderColor: tokens.line,
      }}
    >
      <p className="text-xs font-medium" style={{ color: tokens.ink2 }}>
        {label}
      </p>
      <p className="mt-2 text-[28px] font-semibold leading-none" style={{ color: tokens.ink }}>
        {value}
      </p>
      {hint && (
        <p className="mt-2 text-xs" style={{ color: tokens.ink3 }}>
          {hint}
        </p>
      )}
    </div>
  )
}
