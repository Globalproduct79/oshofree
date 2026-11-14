import Link from 'next/link'
import { switchWorkspaceToAction } from '@/app/app/(console)/switch/actions'
import { Box, DataTable, StatusBadge } from '@/components/og'
import { ActionButton, CommitInput } from '@/components/platform/InlineControls'
import { PageHead } from '@/components/shell/PageHead'
import { advertiserRows } from '@/lib/advertisers'
import { ADVERTISERS as A } from '@/lib/copy-advertisers'
import { SHELL } from '@/lib/copy-shell'
import { usd } from '@/lib/format'
import { MARKETS } from '@/lib/markets'
import { requireAdmin } from '@/lib/session'
import { tokens } from '@/lib/tokens'
import { closeMonthAction, setCreditLimitAction } from './actions'

const small = { color: tokens.ink3, fontSize: 11 }

// Platform › Advertisers (GLB §2.2): every workspace with its credit. The limit saves in place and the row
// redraws with it (D9, D10); the name opens the workspace's page here, "Open workspace" enters it.
// Gated here as well as in the layout: Next can render a page without its layout.
export default async function AdvertisersPage() {
  await requireAdmin()
  const rows = await advertiserRows()

  const body = rows.map((r) => [
    <div key="w">
      <Link href={`/admin/advertisers/${r.id}`}>
        <b>{r.name}</b>
      </Link>
      {r.owner && (
        <>
          <br />
          <small style={small}>{r.owner}</small>
        </>
      )}
    </div>,
    r.type,
    MARKETS[r.country].name,
    <StatusBadge key="s" status={r.status} />,
    <span key="c" style={{ whiteSpace: 'nowrap' }}>
      {r.campaigns} <small style={small}>{A.live(r.live)}</small>
    </span>,
    <CommitInput
      key="l"
      type="dollars"
      value={String(r.creditLimitCents / 100)}
      label={A.creditLabel(r.name)}
      save={setCreditLimitAction.bind(null, r.id)}
    />,
    usd(r.inUseCents),
    <span key="o" style={r.outstandingCents > 0 ? { color: tokens.amber } : undefined}>
      {usd(r.outstandingCents)}
    </span>,
    <ActionButton key="open" size="s" act={switchWorkspaceToAction.bind(null, r.id, '/app')}>
      {A.open}
    </ActionButton>,
  ])

  return (
    <>
      <PageHead
        crumb={[{ label: SHELL.groups.platform }, { label: A.crumb }]}
        title={A.title}
        lead={A.lead}
        actions={<ActionButton act={closeMonthAction}>{A.closeMonth}</ActionButton>}
      />
      <Box>
        <DataTable head={A.head} rows={body} emptyText={A.empty} />
      </Box>
    </>
  )
}
