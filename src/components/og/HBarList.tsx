// Label / purple track / value rows. A bar's length is its value as a share of `max`, which
// defaults to the sum of the rows (the prototype draws each channel against all shares).
export function HBarList({
  rows,
  max,
}: {
  rows: readonly { label: React.ReactNode; value: number; display: React.ReactNode }[]
  max?: number
}) {
  const whole = max ?? rows.reduce((a, r) => a + r.value, 0)
  return (
    <>
      {rows.map((r, i) => (
        <div key={i} className="hbar">
          <span className="lab">{r.label}</span>
          <div className="b">
            <i style={{ width: `${whole > 0 ? Math.min(100, (r.value / whole) * 100) : 0}%` }} />
          </div>
          <span className="v">{r.display}</span>
        </div>
      ))}
    </>
  )
}
