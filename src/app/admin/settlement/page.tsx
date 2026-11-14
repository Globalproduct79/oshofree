import Link from 'next/link'
import { Box, DataTable, MetricCard, StatusBadge } from '@/components/og'
import { PageHead } from '@/components/shell/PageHead'
import { SETTLEMENT as S } from '@/lib/copy-settlement'
import { periodLabel } from '@/lib/copy-money'
import { db } from '@/lib/db'
import { usd } from '@/lib/format'
import { COUNTRIES, MARKETS } from '@/lib/markets'
import { monthBounds, pastStatements } from '@/lib/money'
import { currentShare } from '@/lib/rates'
import { settlementByMarket } from '@/lib/reports'
import { requireAdmin } from '@/lib/session'
import { MarkPaid, ShareInput } from './SettlementControls'

const key = (d: Date) => d.toISOString().slice(0, 7)
const nf = new Intl.NumberFormat('en-US')

// Phoenix settlement (GLB §2.4): one campaign-market month of what the channel is owed, the share
// that applies from the next statement, and the closed statements. Gated here as well as in the layout.
export default async function SettlementPage({ searchParams }: { searchParams?: Promise<{ month?: string }> }) {
  await requireAdmin()
  const { month } = (await searchParams) ?? {}
  const now = new Date()
  const asked = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month ?? '')
  const shown = asked ? new Date(Date.UTC(+asked[1], +asked[2] - 1, 15, 12)) : now
  const selected = key(shown)

  const channel = await db.channel.findUnique({ where: { key: 'phoenix' } })
  const [rows, statements, nowShare] = await Promise.all([
    channel
      ? settlementByMarket(channel.id, shown)
      : Promise.resolve(COUNTRIES.map((country) => ({ country, impressions: 0, deliveryCents: 0, shareCents: 0 }))),
    channel ? pastStatements(channel.id) : Promise.resolve([]),
    channel ? currentShare(channel.id, now) : Promise.resolve(0.55),
  ])
  // The share the month was settled at: the one in force at its last instant.
  const lastInstant = new Date(Math.max(...COUNTRIES.map((c) => monthBounds(c, shown).end.getTime())) - 1)
  const share = channel ? await currentShare(channel.id, lastInstant) : nowShare

  const gross = rows.reduce((n, r) => n + r.deliveryCents, 0)
  const owed = rows.reduce((n, r) => n + r.shareCents, 0)
  const kept = gross - owed

  const months = new Map<string, string>()
  for (let i = 0; i < 6; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 15, 12))
    months.set(key(d), periodLabel(d, 'UTC'))
  }
  for (const s of statements) months.set(key(s.period), periodLabel(s.period, 'UTC'))
  const monthLinks = [...months.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))

  return (
    <>
      <PageHead crumb={[{ label: 'Platform' }, { label: S.crumb }]} title={S.title} lead={S.lead} />
      <nav aria-label={S.monthNav} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        {monthLinks.map(([k, label]) => (
          <Link key={k} href={`/admin/settlement?month=${k}`} aria-current={k === selected ? 'page' : undefined} style={k === selected ? { fontWeight: 700 } : { color: 'var(--ink2)' }}>
            {label}
          </Link>
        ))}
      </nav>
      <div className="mgrid m4">
        <MetricCard title={S.kpi.chargedTitle} value={usd(gross)} sub={S.kpi.chargedSub} fill={100} />
        <MetricCard title={S.kpi.shareTitle} value={S.kpi.shareValue(Math.round(share * 100))} sub={S.kpi.shareSub} fill={share * 100} />
        <MetricCard title={S.kpi.owedTitle} value={usd(owed)} sub={S.kpi.owedSub} fill={100} />
        <MetricCard title={S.kpi.keptTitle} value={usd(kept)} sub={S.kpi.keptSub} fill={(1 - share) * 100} />
      </div>
      <div className="two">
        <Box title={S.marketTitle}>
          <DataTable
            head={S.marketHead}
            rows={rows.map((r) => [<b key="c">{MARKETS[r.country].name}</b>, nf.format(r.impressions), usd(r.deliveryCents), usd(r.shareCents)])}
            emptyText=""
            align={[undefined, 'right', 'right', 'right']}
          />
        </Box>
        <div>
          <Box title={S.shareTitle} sub={S.shareSub}>
            <ShareInput share={nowShare} />
          </Box>
          <Box title={S.pastTitle}>
            <DataTable
              head={[]}
              rows={statements.map((s) => [
                periodLabel(s.period, 'UTC'),
                <b key="a">{usd(s.amountCents)}</b>,
                <StatusBadge key="s" status={s.status === 'paid' ? 'paid' : 'issued'} />,
                s.status === 'open' ? <MarkPaid key="m" id={s.id} /> : '',
              ])}
              emptyText={S.empty}
              align={[undefined, 'right', undefined, 'right']}
            />
          </Box>
        </div>
      </div>
    </>
  )
}
