import Link from 'next/link'
import { Box, DataTable } from '@/components/og'
import { MONEY } from '@/lib/copy-money'
import { fd, loc, usd } from '@/lib/format'
import type { Country } from '@/lib/markets'
import { MARKETS } from '@/lib/markets'
import type { StatementRow } from '@/lib/money'
import { tokens } from '@/lib/tokens'

export type MonthLink = { key: string; label: string }

// The month's charges and payments, newest first, with a month selector. `fx` is null when the
// market has no rate: the local column then shows "—".
export function StatementBox({
  rows, country, fx, months, selected,
}: { rows: StatementRow[]; country: Country; fx: number | null; months: MonthLink[]; selected: string }) {
  const m = MARKETS[country]
  const body = rows.map((r) => [
    fd(r.at, m.timezone),
    r.description,
    <b key="u" style={r.isPayment ? { color: tokens.green } : undefined}>{usd(r.amountCents)}</b>,
    <span key="l" style={{ color: r.isPayment ? tokens.green : tokens.ink3 }}>{fx === null ? '—' : loc(r.amountCents, country, fx)}</span>,
  ])
  return (
    <Box title={MONEY.billing.statementTitle} sub={MONEY.billing.statementSub}>
      <nav aria-label="Statement month" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        {months.map((x) => (
          <Link key={x.key} href={`/app/billing?month=${x.key}`} aria-current={x.key === selected ? 'page' : undefined} style={x.key === selected ? { fontWeight: 700 } : { color: tokens.ink2 }}>
            {x.label}
          </Link>
        ))}
      </nav>
      <DataTable head={MONEY.billing.statementHead(m.currency)} rows={body} emptyText={MONEY.billing.noCharges} align={[undefined, undefined, 'right', 'right']} />
    </Box>
  )
}
