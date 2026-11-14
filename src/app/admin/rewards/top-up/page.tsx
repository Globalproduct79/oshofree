import { Box, EstimatePanel, LinkButton } from '@/components/og'
import { PageHead } from '@/components/shell/PageHead'
import { REWARDS_LEDGER as R } from '@/lib/copy-rewards-ledger'
import { SHELL } from '@/lib/copy-shell'
import { usd } from '@/lib/format'
import { aggregatorBalance } from '@/lib/rewards-ledger'
import { requireAdmin } from '@/lib/session'
import { TopUpForm } from '../RewardsControls'

const LEDGER = '/admin/rewards'

// Rewards ledger › Top up aggregator: the top-up form on a page of its own (it was a box on the ledger), beside
// the balance it adds to. A top-up returns to the ledger with the toast. Gated here as well as in the layout.
export default async function TopUpPage() {
  await requireAdmin()
  const balance = await aggregatorBalance()
  return (
    <>
      <PageHead
        crumb={[{ label: SHELL.groups.platform }, { label: R.crumb, href: LEDGER }, { label: R.topUpTitle }]}
        title={R.topUpTitle}
        lead={R.topUpSub}
        actions={
          <LinkButton variant="ghost" href={LEDGER}>
            {SHELL.nav.rewardsLedger}
          </LinkButton>
        }
      />
      <div className="two">
        <Box>
          <TopUpForm />
        </Box>
        <Box title={R.kpi.balanceTitle}>
          <EstimatePanel label={R.balanceNow} big={usd(balance)} />
        </Box>
      </div>
    </>
  )
}
