import { PageHead } from '@/components/console/PageHead'
import { StatusPill } from '@/components/console/StatusPill'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { COPY } from '@/lib/copy'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/session'
import { tokens } from '@/lib/tokens'
import { openWorkspace } from './actions'

// Gated here as well as in the layout: Next can render a page without its layout.
export default async function AdvertisersPage() {
  await requireAdmin()
  const [workspaces, counts] = await Promise.all([
    db.workspace.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    db.campaign.groupBy({ by: ['workspaceId'], _count: { _all: true } }),
  ])
  const campaigns = new Map(counts.map((c) => [c.workspaceId, c._count._all]))
  const T = COPY.advertisers

  return (
    <>
      <PageHead title={COPY.page.advertisers.title} subtitle={COPY.page.advertisers.subtitle} />
      {workspaces.length === 0 ? (
        <p className="text-sm" style={{ color: tokens.ink2 }}>
          {T.empty}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {T.columns.map((c) => (
                <TableHead key={c}>{c}</TableHead>
              ))}
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {workspaces.map((w) => (
              <TableRow key={w.id}>
                <TableCell className="font-medium">{w.name}</TableCell>
                <TableCell>{w.type}</TableCell>
                <TableCell>{w.country}</TableCell>
                <TableCell>
                  <StatusPill status={w.status} />
                </TableCell>
                <TableCell>{campaigns.get(w.id) ?? 0}</TableCell>
                <TableCell className="text-right">
                  <form action={openWorkspace.bind(null, w.id)}>
                    <Button type="submit" variant="outline" size="sm">
                      {T.open}
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  )
}
