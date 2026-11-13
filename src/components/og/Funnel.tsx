import { fmt } from '@/lib/format'

// "What consumers did": label / orange bar / value. A bar is max(2, value ÷ base × 50)% wide, so
// the first step (value = base) fills half the row. The value prints as fmt() unless `display`
// is given.
export function Funnel({
  rows,
  base,
}: {
  rows: readonly { label: React.ReactNode; value: number; display?: React.ReactNode }[]
  base: number
}) {
  return (
    <div className="fun">
      {rows.map((r, i) => (
        <div key={i}>
          <span className="lab">{r.label}</span>
          <span className="fb" style={{ width: `${Math.max(2, base > 0 ? (r.value / base) * 50 : 0)}%` }} />
          <span className="val">{r.display ?? fmt(r.value)}</span>
        </div>
      ))}
    </div>
  )
}
