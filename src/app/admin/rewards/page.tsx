import { Box, DataTable, MetricCard, StatusBadge } from '@/components/og'
import { PageHead } from '@/components/shell/PageHead'
import { REWARDS_LEDGER as R } from '@/lib/copy-rewards-ledger'
import { FRAUD_RULES, ensureFraudRules } from '@/lib/fraud'
import { db } from '@/lib/db'
import { fd, fmt, pct, usd } from '@/lib/format'
import { rewardsLedgerRows } from '@/lib/reports'
import {
  FULL_BALANCE_CENTS, LOW_BALANCE_CENTS, aggregatorBalance, commonPointsPerShare, heldPayouts, monthTotals, pointsIssued, recentTopUps,
} from '@/lib/rewards-ledger'
import { requireAdmin } from '@/lib/session'
import { FraudToggle, HeldButtons, TopUpForm } from './RewardsControls'

// Rewards ledger (GLB §2.5): what sharers are owed per campaign, the aggregator balance that pays it,
// the three fraud checks as real switches, and the held rewards Global releases or rejects.
export default async function RewardsLedgerPage() {
  await requireAdmin()
  const now = new Date()
  await ensureFraudRules()
  const [rows, totals, balance, points, perShare, topUps, rules, held] = await Promise.all([
    rewardsLedgerRows(), monthTotals(now), aggregatorBalance(), pointsIssued(), commonPointsPerShare(), recentTopUps(),
    db.fraudRule.findMany(), heldPayouts(),
  ])
  const enabled = new Map(rules.map((r) => [r.key, r.enabled]))
  const { earnedCents, sentCents } = totals
  const queuedCents = earnedCents - sentCents
  const balanceSub =
    balance < LOW_BALANCE_CENTS ? R.kpi.balanceLow
    : earnedCents > 0 ? R.kpi.balanceDays(Math.round(balance / (earnedCents / 30)))
    : R.kpi.balanceIdle

  return (
    <>
      <PageHead crumb={[{ label: 'Platform' }, { label: R.crumb }]} title={R.title} lead={R.lead} />
      <div className="mgrid m4">
        <MetricCard title={R.kpi.earnedTitle} value={usd(earnedCents)} sub={R.kpi.earnedSub} fill={100} />
        <MetricCard title={R.kpi.sentTitle} value={usd(sentCents)} sub={R.kpi.sentSub(pct(queuedCents, earnedCents))} fill={earnedCents ? (sentCents / earnedCents) * 100 : 0} />
        <MetricCard title={R.kpi.balanceTitle} value={usd(balance)} sub={balanceSub} fill={Math.max(0, Math.min(100, (balance / FULL_BALANCE_CENTS) * 100))} />
        <MetricCard title={R.kpi.pointsTitle} value={fmt(points)} sub={R.kpi.pointsSub(perShare)} fill={100} />
      </div>
      <div className="two">
        <Box title={R.campaignTitle}>
          <DataTable
            head={R.campaignHead}
            rows={rows.map((r) => [
              <b key="n">{r.name}</b>,
              r.workspaceName,
              fmt(r.successfulShares),
              `${r.symbol}${r.rewardLocal}`,
              <b key="o">{usd(r.owedCents)}</b>,
              <StatusBadge key="s" status={r.rechargeStatus === 'paid' ? 'paid' : 'issued'} />,
            ])}
            emptyText=""
            align={[undefined, undefined, 'right', 'right', 'right', undefined]}
          />
        </Box>
        <div>
          <Box title={R.topUpTitle} sub={R.topUpSub}>
            <TopUpForm />
            {topUps.length > 0 && (
              <>
                <h4 style={{ margin: '16px 0 6px' }}>{R.recentTitle}</h4>
                <DataTable
                  head={[]}
                  rows={topUps.map((t) => [fd(t.at, 'UTC'), <b key="a">{usd(t.amountCents)}</b>, t.by])}
                  emptyText={R.recentEmpty}
                  align={[undefined, 'right', undefined]}
                />
              </>
            )}
          </Box>
          <Box title={R.fraudTitle}>
            {FRAUD_RULES.map((r) => (
              <FraudToggle key={r.key} ruleKey={r.key} label={r.label} sub={r.action} enabled={enabled.get(r.key) ?? true} />
            ))}
          </Box>
        </div>
      </div>
      <Box title={R.heldTitle}>
        <DataTable
          head={[...R.heldHead, '']}
          rows={held.map((h) => [
            <b key="c">{h.campaign}</b>,
            h.sharer,
            `${h.local} · ${usd(h.amountCents)}`,
            h.reason ? (R.reasons[h.reason] ?? h.reason) : '',
            fd(h.createdAt, 'UTC'),
            <HeldButtons key="b" id={h.id} />,
          ])}
          emptyText={R.heldEmpty}
          align={[undefined, undefined, 'right', undefined, undefined, 'right']}
        />
      </Box>
    </>
  )
}
