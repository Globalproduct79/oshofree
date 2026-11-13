// Two columns of grey cells: a small label over a bold value.
export function KVGrid({ items }: { items: readonly { label: React.ReactNode; value: React.ReactNode }[] }) {
  return (
    <div className="kv">
      {items.map((it, i) => (
        <div key={i}>
          <small>{it.label}</small>
          <b>{it.value}</b>
        </div>
      ))}
    </div>
  )
}
