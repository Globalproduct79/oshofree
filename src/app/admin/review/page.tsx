import { RunDailyJobButton } from '@/components/demo/RunDailyJobButton'
import { SimulateDayButton } from '@/components/demo/SimulateDayButton'
import { Box, EmptyState } from '@/components/og'
import { KpiStrip } from '@/components/platform/KpiStrip'
import { LiveNow } from '@/components/platform/LiveNow'
import { NewAdvertisers } from '@/components/platform/NewAdvertisers'
import { QueueRow } from '@/components/platform/QueueRow'
import { PageHead } from '@/components/shell/PageHead'
import { REVIEW } from '@/lib/copy-review'
import { SHELL } from '@/lib/copy-shell'
import { demoControlsOn } from '@/lib/demo/controls'
import { platformKpis } from '@/lib/reports'
import { reviewQueue } from '@/lib/review'
import { requireAdmin } from '@/lib/session'
import { runDailyJobAction, simulateDayAction } from './actions'

// Review (GLB §2.1): the platform's numbers, new advertisers, the queue of campaigns and revised offers, and
// everything live. Gated here as well as in the layout: Next can render a page without its layout.
export default async function ReviewPage() {
  const admin = await requireAdmin()
  const now = new Date()
  const [kpis, queue] = await Promise.all([platformKpis(now), reviewQueue(now)])
  const demo = demoControlsOn(admin.isGlobalAdmin)

  return (
    <>
      <PageHead
        crumb={[{ label: SHELL.groups.platform }, { label: REVIEW.crumb }]}
        title={REVIEW.title}
        lead={REVIEW.lead}
        actions={
          demo && (
            <>
              <SimulateDayButton action={simulateDayAction} />
              <RunDailyJobButton action={runDailyJobAction} />
            </>
          )
        }
      />
      <KpiStrip kpis={kpis} waiting={queue.rows.length} />
      <NewAdvertisers workspaces={queue.pendingWorkspaces} />
      <Box title={REVIEW.queue.title} sub={REVIEW.queue.sub}>
        {queue.rows.length === 0 ? (
          <EmptyState>{REVIEW.queue.empty}</EmptyState>
        ) : (
          queue.rows.map((row) => <QueueRow key={`${row.kind}:${row.id}`} row={row} />)
        )}
      </Box>
      <LiveNow cards={queue.livenow} />
    </>
  )
}
