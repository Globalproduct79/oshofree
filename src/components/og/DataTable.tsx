import { tokens } from '@/lib/tokens'
import { RowLink } from './RowLink'

type Align = 'left' | 'right' | undefined

// The prototype's plain table: grey headings, ruled rows, one full-width line when empty. Rows
// are clickable (`tr.row`) with `rowHref` (any caller) or `onRowClick` (client callers only).
// `align` sets a column's text-align on its heading and cells (money columns are right-aligned).
export function DataTable({
  head,
  rows,
  emptyText,
  align = [],
  rowHref,
  onRowClick,
}: {
  head: readonly string[]
  rows: readonly (readonly React.ReactNode[])[]
  emptyText: React.ReactNode
  align?: readonly Align[]
  rowHref?: (index: number) => string
  onRowClick?: (index: number) => void
}) {
  const style = (col: number) => (align[col] ? { textAlign: align[col] } : undefined)
  const cells = (row: readonly React.ReactNode[]) =>
    row.map((cell, j) => (
      <td key={j} style={style(j)}>
        {cell}
      </td>
    ))
  return (
    <table>
      {head.length > 0 && (
        <thead>
          <tr>
            {head.map((h, j) => (
              <th key={j} style={style(j)}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={Math.max(1, head.length)} style={{ color: tokens.ink3 }}>
              {emptyText}
            </td>
          </tr>
        ) : (
          rows.map((row, i) =>
            rowHref ? (
              <RowLink key={i} href={rowHref(i)}>
                {cells(row)}
              </RowLink>
            ) : onRowClick ? (
              <tr
                key={i}
                className="row"
                tabIndex={0}
                onClick={() => onRowClick(i)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onRowClick(i)
                }}
              >
                {cells(row)}
              </tr>
            ) : (
              <tr key={i}>{cells(row)}</tr>
            ),
          )
        )}
      </tbody>
    </table>
  )
}
