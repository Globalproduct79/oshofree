'use client'

export type PillOption<K extends string> = { key: K; label: React.ReactNode; count: React.ReactNode }

// The rounded filter pills with a grey count; the pressed one is peach and orange.
export function FilterPills<K extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly PillOption<K>[]
  value: K
  onChange: (key: K) => void
}) {
  return (
    <div className="pills">
      {options.map((o) => (
        <button key={o.key} type="button" className="pill" aria-pressed={o.key === value} onClick={() => onChange(o.key)}>
          {o.label}
          <i>{o.count}</i>
        </button>
      ))}
    </div>
  )
}
