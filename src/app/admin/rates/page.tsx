import { Box, Button, DataTable, LinkButton } from '@/components/og'
import { PageHead } from '@/components/shell/PageHead'
import { RATES } from '@/lib/copy-rates'
import { SHELL } from '@/lib/copy-shell'
import { db } from '@/lib/db'
import { COUNTRIES } from '@/lib/markets'
import { currentFx, EXPECTED_OPEN_RATE, PLACEMENTS, rateTable } from '@/lib/rates'
import { requireAdmin } from '@/lib/session'
import { RatesTable, type RatesRow } from './RatesTable'

// Gated here as well as in the layout: Next can render a page without its layout.
export default async function RatesPage() {
  await requireAdmin()
  const now = new Date()
  const channel = await db.channel.findUnique({ where: { key: 'phoenix' } })
  const table = channel ? await rateTable(channel.id, now) : null
  const fxs = await Promise.all(COUNTRIES.map((c) => currentFx(c, now).catch(() => null)))
  const rows: RatesRow[] = COUNTRIES.map((country, i) => ({
    country,
    cpm: table?.[i].cpmCents ?? { card: null, featured: null, video: null, splash: null },
    fx: fxs[i],
  }))

  return (
    <>
      <PageHead
        crumb={[{ label: SHELL.groups.platform }, { label: RATES.crumb }]}
        title={RATES.title}
        lead={RATES.lead}
        actions={
          <LinkButton variant="ghost" href="/admin/settlement">
            {SHELL.nav.settlement}
          </LinkButton>
        }
      />
      <div className="pills">
        <span className="pill" aria-pressed="true">
          {RATES.phoenix.name}
          <i>{RATES.phoenix.status(channel?.isLive ?? null)}</i>
        </span>
        <span className="pill" aria-pressed="false">
          {RATES.boomplay.name}
          <i>{RATES.boomplay.status}</i>
        </span>
      </div>
      <div className="two">
        <Box title={RATES.tableTitle} sub={RATES.tableSub}>
          <RatesTable rows={rows} editable={channel !== null} />
        </Box>
        <div>
          <Box title={RATES.boomplayTitle} sub={RATES.boomplaySub}>
            <Button variant="ghost" disabled>
              {RATES.addChannel}
            </Button>
          </Box>
          <Box title={RATES.openTitle} sub={RATES.openSub}>
            <DataTable
              head={[]}
              rows={PLACEMENTS.map((p) => [RATES.placements[p], <b key={p}>{(EXPECTED_OPEN_RATE[p] * 100).toFixed(1)}%</b>])}
              emptyText=""
              align={['left', 'right']}
            />
          </Box>
        </div>
      </div>
    </>
  )
}
