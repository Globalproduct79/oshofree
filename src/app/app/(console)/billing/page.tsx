import { AlertBox, Box, KVGrid, MetricCard } from '@/components/og'
import { PageHead } from '@/components/shell/PageHead'
import { MONEY, periodLabel } from '@/lib/copy-money'
import { SHELL } from '@/lib/copy-shell'
import { loc, usd } from '@/lib/format'
import { MARKETS } from '@/lib/markets'
import { creditSummary, monthBounds, statement, statementMonths } from '@/lib/money'
import { can, requireMember } from '@/lib/permissions'
import { currentFx } from '@/lib/rates'
import { accountManagerShown } from '@/lib/workspaces'
import { RequestCredit } from './RequestCredit'
import { StatementBox, type MonthLink } from './StatementBox'

const B = MONEY.billing

// 'YYYY-MM' of the local month that starts at `start`, read in the market's zone.
function monthKey(start: Date, timeZone: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(start).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}`
}

// Billing & credit (ADV §7): credit KPIs, the over-limit alert, the month's statement, how you
// pay and the request for more credit.
export default async function BillingPage({ searchParams }: { searchParams?: Promise<{ month?: string }> }) {
  const { workspace: ws, role } = await requireMember('billing')
  const { month } = (await searchParams) ?? {}
  const m = MARKETS[ws.country]
  const now = new Date()
  const current = monthBounds(ws.country, now)
  const asked = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month ?? '')
  const shown = asked ? monthBounds(ws.country, new Date(Date.UTC(+asked[1], +asked[2] - 1, 15, 12))) : current

  const [c, rows, starts, fx] = await Promise.all([
    creditSummary(ws.id),
    statement(ws.id, shown.start),
    statementMonths(ws.id),
    currentFx(ws.country, now).catch(() => null),
  ])
  const all = [...starts]
  if (!all.some((s) => s.getTime() === current.start.getTime())) all.unshift(current.start)
  all.sort((a, b) => b.getTime() - a.getTime())
  const months: MonthLink[] = all.map((s) => ({ key: monthKey(s, m.timezone), label: periodLabel(s, m.timezone) }))

  const fill = (n: number) => (c.limitCents === 0 ? 0 : (n / c.limitCents) * 100)
  const next = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: m.timezone }).format(current.end)
  const monthName = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: m.timezone }).format(current.start)

  return (
    <>
      <PageHead
        crumb={[{ label: ws.name }, { label: SHELL.groups.money }, { label: B.title }]}
        title={B.title}
        lead={B.lead}
      />
      <div className="mgrid m4">
        <MetricCard title={B.limitTitle} value={usd(c.limitCents)} sub={B.limitSub} fill={100} />
        <MetricCard title={B.inUseTitle} value={usd(c.inUseCents)} sub={B.inUseSub} fill={fill(c.inUseCents)} />
        <MetricCard title={B.availableTitle} value={usd(c.availableCents)} sub={c.nearLimit ? B.nearLimitSub : B.availableSub} fill={fill(c.availableCents)} />
        <MetricCard
          title={B.unbilledTitle}
          value={usd(c.unbilledCents)}
          sub={fx === null ? B.unbilledSubNoFx : B.unbilledSub(loc(c.unbilledCents, ws.country, fx))}
          fill={100}
        />
      </div>
      {c.overLimit && <AlertBox lead={MONEY.limitReached}>{MONEY.limitReachedDetail}</AlertBox>}
      <div className="two">
        <StatementBox rows={rows} country={ws.country} fx={fx} months={months} selected={monthKey(shown.start, m.timezone)} />
        <div>
          <Box title={B.howYouPayTitle} sub={B.howYouPay(m.currency, m.symbol, fx, monthName, ws.termsDays)}>
            <KVGrid
              items={[
                { label: B.currencyKey, value: m.currency },
                { label: B.termsKey, value: B.terms(ws.termsDays) },
                { label: B.nextInvoiceKey, value: `1 ${next}` },
                { label: B.accountManagerKey, value: accountManagerShown(ws.accountManager, ws.status) },
              ]}
            />
          </Box>
          <Box title={B.moreTitle} sub={B.moreSub}>
            {can(role, 'requestCredit') && <RequestCredit />}
          </Box>
        </div>
      </div>
    </>
  )
}
