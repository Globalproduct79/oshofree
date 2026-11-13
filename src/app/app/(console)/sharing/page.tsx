import Link from 'next/link'
import { SharingSection } from '@/components/campaign/SharingSection'
import { Box } from '@/components/console/Section'
import { PageHead } from '@/components/console/PageHead'
import { StatusPill } from '@/components/console/StatusPill'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { effectiveStatus } from '@/lib/campaign-status'
import { COPY } from '@/lib/copy'
import { db } from '@/lib/db'
import { num } from '@/lib/format'
import { workspaceCampaignShares, workspaceSharing } from '@/lib/reports'
import { tokens } from '@/lib/tokens'
import { requireWorkspace } from '@/lib/workspaces'

const S = COPY.campaign.sharing

export default async function SharingPage() {
  const ws = await requireWorkspace()
  const now = new Date()
  const [sharing, counts, campaigns] = await Promise.all([
    workspaceSharing(ws.id),
    workspaceCampaignShares(ws.id),
    db.campaign.findMany({ where: { workspaceId: ws.id } }),
  ])
  const rows = campaigns
    .map((c) => {
      const n = counts.find((r) => r.campaignId === c.id)
      return { c, shares: n?.shares ?? 0, friendClaims: n?.friendClaims ?? 0 }
    })
    .sort((a, b) => b.shares - a.shares || a.c.name.localeCompare(b.c.name))
  const head = { color: tokens.ink3 }
  const th = 'h-auto py-2 align-bottom font-medium whitespace-normal'

  return (
    <>
      <PageHead title={COPY.page.sharing.title} subtitle={COPY.page.sharing.subtitle} />
      {sharing.shares === 0 ? (
        <p className="text-sm" style={{ color: tokens.ink2 }}>
          {S.workspaceEmpty}
        </p>
      ) : (
        <SharingSection sharing={sharing} />
      )}
      {rows.length > 0 && (
        <Box>
          <h3 className="mb-2 text-sm font-semibold" style={{ color: tokens.ink }}>
            {S.campaigns}
          </h3>
          <Table>
            <TableHeader>
              <TableRow style={{ borderColor: tokens.line }}>
                <TableHead className={`${th} pl-0`} style={head}>{S.campaign}</TableHead>
                <TableHead className={th} style={head}>{S.brand}</TableHead>
                <TableHead className={th} style={head} />
                <TableHead className={`${th} text-right`} style={head}>{S.shares}</TableHead>
                <TableHead className={`${th} pr-0 text-right`} style={head}>{S.friendClaims}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ c, shares, friendClaims }) => (
                <TableRow key={c.id} className="hover:bg-transparent" style={{ borderColor: tokens.line, color: tokens.ink }}>
                  <TableCell className="pl-0 font-medium">
                    <Link href={`/app/campaigns/${c.id}`} className="underline-offset-2 hover:underline">
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell>{c.brand}</TableCell>
                  <TableCell>
                    <StatusPill status={effectiveStatus(c, now)} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{num(shares)}</TableCell>
                  <TableCell className="pr-0 text-right tabular-nums">{num(friendClaims)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </>
  )
}
