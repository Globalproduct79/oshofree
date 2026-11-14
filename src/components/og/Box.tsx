// The white panel every page is built from: optional h3 and grey sub-line, then the body.
export function Box({
  title,
  sub,
  className,
  id,
  children,
}: {
  title?: React.ReactNode
  sub?: React.ReactNode
  className?: string
  // An anchor a link can land on (the campaign page's Recent activity).
  id?: string
  children?: React.ReactNode
}) {
  return (
    <div className={className ? `box ${className}` : 'box'} id={id}>
      {title && <h3>{title}</h3>}
      {sub && <p className="sub">{sub}</p>}
      {children}
    </div>
  )
}
