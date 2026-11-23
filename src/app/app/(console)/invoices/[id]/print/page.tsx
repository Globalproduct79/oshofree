import { notFound } from 'next/navigation'
import { Box, DataTable, StatusBadge } from '@/components/og'
import { PageHead } from '@/components/shell/PageHead'
import { MONEY, periodLabel } from '@/lib/copy-money'
import { SHELL } from '@/lib/copy-shell'
import { db } from '@/lib/db'
import { fd, loc, usd } from '@/lib/format'
import { MARKETS } from '@/lib/markets'
import { INVOICE_BADGE, invoiceStatus } from '@/lib/money'
import { requireMember } from '@/lib/permissions'
import { tokens } from '@/lib/tokens'
import { PrintButton } from './PrintButton'

const P = MONEY.print
const fxNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

// The printable invoice: its status beside the title, its lines in USD and in local currency at the invoice's own rate.
// Printing hides the shell and the breadcrumb (console.css), so the page prints as the invoice alone.
export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { workspace: ws } = await requireMember('billing')
  const inv = await db.invoice.findUnique({ where: { id } })
  if (!inv || inv.workspaceId !== ws.id) notFound()
  // In the country it was issued under, whatever the workspace's billing country is now.
  const m = MARKETS[inv.country]
  const fx = Number(inv.fxPerUsd)
  const lines = await db.ledgerEntry.findMany({
    where: { invoiceId: inv.id, kind: { not: 'payment' } },
    orderBy: [{ at: 'asc' }, { id: 'asc' }],
  })
  // Charges are stored negative; the invoice shows them as amounts owed.
  const owed = (cents: number) => -cents
  const rows = lines.map((l) => [
    fd(l.at, m.timezone),
    l.description,
    <b key="u">{usd(owed(l.amountCents))}</b>,
    <span key="l" style={{ color: tokens.ink3 }}>{loc(owed(l.amountCents), inv.country, fx)}</span>,
  ])
  const total = lines.reduce((s, l) => s + owed(l.amountCents), 0) || inv.amountCents

  return (
    <>
      <PageHead
        crumb={[{ label: ws.name }, { label: SHELL.groups.money }, { label: SHELL.nav.invoices, href: '/app/invoices' }, { label: inv.number }]}
        title={P.title(inv.number)}
        badge={<StatusBadge status={INVOICE_BADGE[invoiceStatus(inv)]} />}
        lead={P.period(periodLabel(inv.period, m.timezone))}
        actions={<PrintButton label={P.action} />}
      />
      <Box title={ws.name} sub={ws.registrationNumber ? P.registration(ws.registrationNumber) : undefined}>
        <p>{P.issued(fd(inv.issuedAt, m.timezone))} · {inv.status === 'paid' && inv.paidAt ? P.paid(fd(inv.paidAt, m.timezone)) : P.due(fd(inv.dueAt, m.timezone))}</p>
        <DataTable head={P.head(m.currency)} rows={rows} emptyText={P.noLines} align={[undefined, undefined, 'right', 'right']} />
        <p>
          <b>{P.total}</b> <b>{usd(total)}</b> <span style={{ color: tokens.ink3 }}>{loc(total, inv.country, fx)}</span>
        </p>
        <p style={{ color: tokens.ink3 }}>{P.rate(m.symbol, fxNumber.format(fx))}</p>
        <p>{P.pay(inv.number)}</p>
      </Box>
    </>
  )
}
