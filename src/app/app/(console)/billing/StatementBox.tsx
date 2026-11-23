import Link from '@/components/og/Link'
import { Box, DataTable } from '@/components/og'
import { MONEY } from '@/lib/copy-money'
import { fd, loc, usd } from '@/lib/format'
import type { Country } from '@/lib/markets'
import { MARKETS } from '@/lib/markets'
import type { StatementRow } from '@/lib/money'
import { tokens } from '@/lib/tokens'

export type MonthLink = { key: string; label: string }

// The month's charges and payments, newest first, with a month selector. A row on an invoice is in local currency at
// that invoice's rate; an unbilled one at today's `fx`, null when the market has no rate (the column then shows "—").
export function StatementBox({
  rows, country, fx, months, selected,
}: { rows: StatementRow[]; country: Country; fx: number | null; months: MonthLink[]; selected: string }) {
  const m = MARKETS[country]
  const local = (r: StatementRow) => {
    const rate = r.fxPerUsd ?? fx
    return rate === null ? '—' : loc(r.amountCents, country, rate)
  }
  const body = rows.map((r) => [
    fd(r.at, m.timezone),
    r.description,
    <b key="u" style={r.isPayment ? { color: tokens.green } : undefined}>{usd(r.amountCents)}</b>,
    <span key="l" style={{ color: r.isPayment ? tokens.green : tokens.ink3 }}>{local(r)}</span>,
  ])
  return (
    <Box title={MONEY.billing.statementTitle} sub={MONEY.billing.statementSub}>
      <nav aria-label={MONEY.billing.monthNav} className="months">
        {months.map((x) => (
          <Link key={x.key} href={`/app/billing?month=${x.key}`} aria-current={x.key === selected ? 'page' : undefined}>
            {x.label}
          </Link>
        ))}
      </nav>
      <DataTable head={MONEY.billing.statementHead(m.currency)} rows={body} emptyText={MONEY.billing.noCharges} align={[undefined, undefined, 'right', 'right']} />
    </Box>
  )
}
