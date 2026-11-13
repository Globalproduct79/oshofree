// The grey estimate panel: small label, big number, an optional small note, then label/value
// rows divided by rules (the form's Cost box; Sharing's Points issued has no rows).
export function EstimatePanel({
  label,
  big,
  note,
  rows = [],
}: {
  label: React.ReactNode
  big: React.ReactNode
  note?: React.ReactNode
  rows?: readonly { label: React.ReactNode; value: React.ReactNode }[]
}) {
  return (
    <div className="est">
      <small>{label}</small>
      <b>{big}</b>
      {note && <small>{note}</small>}
      {rows.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {rows.map((r, i) => (
            <div key={i} className="r">
              <span>{r.label}</span>
              <span>{r.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
