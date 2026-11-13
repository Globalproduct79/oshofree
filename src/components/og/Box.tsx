// The white panel every page is built from: optional h3 and grey sub-line, then the body.
export function Box({
  title,
  sub,
  className,
  children,
}: {
  title?: React.ReactNode
  sub?: React.ReactNode
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div className={className ? `box ${className}` : 'box'}>
      {title && <h3>{title}</h3>}
      {sub && <p className="sub">{sub}</p>}
      {children}
    </div>
  )
}
