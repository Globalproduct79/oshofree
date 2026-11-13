import { Box } from '@/components/console/Section'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { COPY } from '@/lib/copy'
import { num } from '@/lib/format'
import { tokens } from '@/lib/tokens'

const S = COPY.campaign.sharing

export type SharingTableRow = { key: string; name: string; shares: number; friendOpens: number; friendClaims: number }

// A small breakdown of shares and what friends did with them: by channel, or by the medium shared through.
export function SharingTable({ title, first, rows }: { title: string; first: string; rows: SharingTableRow[] }) {
  const head = { color: tokens.ink3 }
  const th = 'h-auto py-2 align-bottom font-medium whitespace-normal'
  return (
    <Box>
      <h3 className="mb-2 text-sm font-semibold" style={{ color: tokens.ink }}>
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm" style={{ color: tokens.ink3 }}>
          {S.noShares}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow style={{ borderColor: tokens.line }}>
              <TableHead className={`${th} pl-0`} style={head}>{first}</TableHead>
              <TableHead className={`${th} text-right`} style={head}>{S.shares}</TableHead>
              <TableHead className={`${th} text-right`} style={head}>{S.friendOpens}</TableHead>
              <TableHead className={`${th} pr-0 text-right`} style={head}>{S.friendClaims}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.key} className="hover:bg-transparent" style={{ borderColor: tokens.line, color: tokens.ink }}>
                <TableCell className="pl-0">{r.name}</TableCell>
                <TableCell className="text-right tabular-nums">{num(r.shares)}</TableCell>
                <TableCell className="text-right tabular-nums">{num(r.friendOpens)}</TableCell>
                <TableCell className="pr-0 text-right tabular-nums">{num(r.friendClaims)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Box>
  )
}
