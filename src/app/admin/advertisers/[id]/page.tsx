import { notFound } from 'next/navigation'
import { setCreditLimitAction } from '@/app/admin/advertisers/actions'
import { Box, DataTable, EmptyState, KVGrid, StatusBadge } from '@/components/og'
import { EnterCampaignCards } from '@/components/platform/EnterCampaignCards'
import { ActionButton, CommitInput, CommitSelect } from '@/components/platform/InlineControls'
import { PageHead } from '@/components/shell/PageHead'
import { advertiserDetail } from '@/lib/advertisers'
import { ADVERTISERS } from '@/lib/copy-advertisers'
import { SHELL } from '@/lib/copy-shell'
import { usd } from '@/lib/format'
import { COUNTRIES, MARKETS } from '@/lib/markets'
import { requireAdmin } from '@/lib/session'
import { tokens } from '@/lib/tokens'
import { markInvoicePaidAction, updateFactAction } from './actions'
import { CreditRequests } from './CreditRequests'
import { StatusControls } from './StatusControls'

const A = ADVERTISERS
const D = ADVERTISERS.detail
const TYPES = [{ value: 'Brand', label: 'Brand' }, { value: 'Agency', label: 'Agency' }] as const
const MARKET_OPTIONS = COUNTRIES.map((c) => ({ value: c, label: MARKETS[c].name }))
// The invoice's display status as its pill: the running month's `open` is the blue "Open".
const PILL = { paid: 'paid', due: 'due', overdue: 'overdue', open: 'issued' } as const

// Platform › Advertisers › {workspace} (spec §6.1, §6.5, §6.14.6): the facts Global controls, the campaigns,
// invoices to mark paid, credit requests to decide and the audit trail. Not in the prototype.
// Gated here as well as in the layout: Next can render a page without its layout.
export default async function AdvertiserPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const { id } = await params
  const d = await advertiserDetail(id, new Date())
  if (!d) notFound()
  const m = MARKETS[d.country]

  const invoices = d.invoices.map((inv) => [
    <b key="n">{inv.number}</b>,
    inv.period,
    <StatusBadge key="s" status={PILL[inv.status]} />,
    inv.due,
    <b key="u">{usd(inv.amountCents)}</b>,
    <span key="l" style={{ color: tokens.ink3 }}>{inv.local}</span>,
    inv.payable ? (
      <ActionButton key="p" size="s" act={markInvoicePaidAction.bind(null, inv.id)}>
        {D.markPaid}
      </ActionButton>
    ) : null,
  ])

  return (
    <>
      <PageHead
        crumb={[{ label: SHELL.groups.platform }, { label: A.crumb, href: '/admin/advertisers' }, { label: d.name }]}
        title={d.name}
        lead={D.lead(d.type, m.name, d.owner ?? D.noOwner, d.since)}
      />
      <Box title={D.facts}>
        <KVGrid
          items={[
            {
              label: D.status,
              value: <StatusControls id={d.id} name={d.name} status={d.status} declineReason={d.declineReason} />,
            },
            {
              label: D.type,
              value: <CommitSelect value={d.type} options={TYPES} label={D.type} save={updateFactAction.bind(null, d.id, 'type')} />,
            },
            {
              label: D.country,
              value: (
                <CommitSelect value={d.country} options={MARKET_OPTIONS} label={D.country} save={updateFactAction.bind(null, d.id, 'country')} />
              ),
            },
            {
              label: D.creditLimit,
              value: (
                <CommitInput type="dollars" value={String(d.creditLimitCents / 100)} label={D.creditLimit} save={setCreditLimitAction.bind(null, d.id)} />
              ),
            },
            {
              label: D.registration,
              value: (
                <CommitInput value={d.registrationNumber ?? ''} width={180} label={D.registration} save={updateFactAction.bind(null, d.id, 'registrationNumber')} />
              ),
            },
            {
              label: D.manager,
              value: <CommitInput value={d.accountManager} width={180} label={D.manager} save={updateFactAction.bind(null, d.id, 'accountManager')} />,
            },
            { label: D.terms, value: D.termsValue(d.termsDays) },
            { label: D.since, value: d.since },
          ]}
        />
      </Box>
      <Box title={D.campaigns}>
        {d.cards.length > 0 ? <EnterCampaignCards cards={d.cards} /> : <EmptyState>{D.noCampaigns}</EmptyState>}
      </Box>
      <Box title={D.invoices}>
        <DataTable
          head={D.invoicesHead(m.currency)}
          rows={invoices}
          emptyText={D.noInvoices}
          align={[undefined, undefined, undefined, undefined, 'right', 'right']}
        />
      </Box>
      <Box title={D.requests}>
        <CreditRequests requests={d.requests} limitDollars={d.creditLimitCents / 100} />
      </Box>
      <Box title={D.history}>
        <DataTable head={D.historyHead} rows={d.history.map((h) => [h.at, h.actor, h.action, h.change])} emptyText={D.noHistory} />
      </Box>
    </>
  )
}
