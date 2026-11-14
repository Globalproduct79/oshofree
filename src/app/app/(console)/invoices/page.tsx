import { Box, DataTable, LinkButton, StatusBadge } from '@/components/og'
import { PageHead } from '@/components/shell/PageHead'
import { MONEY, periodLabel } from '@/lib/copy-money'
import { SHELL } from '@/lib/copy-shell'
import { fd, loc, usd } from '@/lib/format'
import { MARKETS } from '@/lib/markets'
import { creditSummary, invoiceStatus, monthBounds } from '@/lib/money'
import { db } from '@/lib/db'
import { requireMember } from '@/lib/permissions'
import { currentFx } from '@/lib/rates'
import { tokens } from '@/lib/tokens'

const I = MONEY.invoices
const STATUS = { paid: 'paid', due: 'due', overdue: 'overdue', open: 'issued' } as const

// Invoices (ADV §8): the workspace's monthly invoices, newest first, then the running month.
// "Mark paid" is Global's, not the advertiser's.
export default async function InvoicesPage() {
  const { workspace: ws } = await requireMember('billing')
  const m = MARKETS[ws.country]
  const now = new Date()
  const current = monthBounds(ws.country, now)
  const [invoices, credit, fx] = await Promise.all([
    db.invoice.findMany({ where: { workspaceId: ws.id }, orderBy: [{ period: 'desc' }, { number: 'desc' }] }),
    creditSummary(ws.id),
    currentFx(ws.country, now).catch(() => null),
  ])

  // An issued invoice keeps the country it was issued under (its currency and month); the running month is the
  // workspace's current one.
  const rows: React.ReactNode[][] = invoices.map((inv) => {
    const status = invoiceStatus(inv, now)
    const issuedIn = MARKETS[inv.country].timezone
    return [
      <b key="n">{inv.number}</b>,
      periodLabel(inv.period, issuedIn),
      <StatusBadge key="s" status={STATUS[status]} />,
      status === 'paid' ? '—' : fd(inv.dueAt, issuedIn),
      <b key="u">{usd(inv.amountCents)}</b>,
      <span key="l" style={{ color: tokens.ink3 }}>{loc(inv.amountCents, inv.country, Number(inv.fxPerUsd))}</span>,
      <LinkButton key="p" variant="ghost" size="s" href={`/app/invoices/${inv.id}/print`} target="_blank">{I.pdf}</LinkButton>,
    ]
  })
  if (credit.unbilledCents > 0) {
    const due = new Date(current.end.getTime() + ws.termsDays * 86_400_000)
    rows.unshift([
      <b key="n">{I.runningNumber}</b>,
      I.toDate(periodLabel(current.start, m.timezone)),
      <StatusBadge key="s" status="issued" />,
      fd(due, m.timezone),
      <b key="u">{usd(credit.unbilledCents)}</b>,
      <span key="l" style={{ color: tokens.ink3 }}>{fx === null ? '—' : loc(credit.unbilledCents, ws.country, fx)}</span>,
      null,
    ])
  }

  return (
    <>
      <PageHead
        crumb={[{ label: ws.name }, { label: SHELL.groups.money }, { label: I.title }]}
        title={I.title}
        lead={I.lead}
        actions={
          <LinkButton variant="ghost" href="/app/billing">
            {SHELL.nav.billing}
          </LinkButton>
        }
      />
      <Box>
        <DataTable head={I.head(m.currency)} rows={rows} emptyText={I.empty} align={[undefined, undefined, undefined, undefined, 'right', 'right']} />
      </Box>
    </>
  )
}
