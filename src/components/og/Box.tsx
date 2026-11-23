// The white panel every page is built from: optional h3 (with a grey count beside it, never inside it, so the
// heading's accessible name stays the title) and grey sub-line, then the body.
export function Box({
  title,
  count,
  sub,
  className,
  id,
  children,
}: {
  title?: React.ReactNode
  // A number shown after the title (People's Members 2); left out, or 0 on a list that is empty, it is not shown.
  count?: number
  sub?: React.ReactNode
  className?: string
  // An anchor a link can land on (the campaign page's Recent activity).
  id?: string
  children?: React.ReactNode
}) {
  return (
    <div className={className ? `box ${className}` : 'box'} id={id}>
      {title && count ? (
        <div className="bt">
          <h3>{title}</h3>
          <span className="n">{count}</span>
        </div>
      ) : (
        title && <h3>{title}</h3>
      )}
      {sub && <p className="sub">{sub}</p>}
      {children}
    </div>
  )
}
