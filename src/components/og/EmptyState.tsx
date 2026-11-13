// Centred grey line with an optional h3; `box` makes it its own white panel (home's
// "Nothing on Phoenix yet").
export function EmptyState({
  title,
  box,
  children,
}: {
  title?: React.ReactNode
  box?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={box ? 'box empty' : 'empty'}>
      {title && <h3>{title}</h3>}
      {children}
    </div>
  )
}
