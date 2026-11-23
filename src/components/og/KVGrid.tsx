// Two columns of grey cells: a small label over a bold value. A `wide` cell spans both columns (a long text).
export function KVGrid({ items }: { items: readonly { label: React.ReactNode; value: React.ReactNode; wide?: boolean }[] }) {
  return (
    <div className="kv">
      {items.map((it, i) => (
        <div key={i} className={it.wide ? 'wide' : undefined}>
          <small>{it.label}</small>
          <b>{it.value}</b>
        </div>
      ))}
    </div>
  )
}
