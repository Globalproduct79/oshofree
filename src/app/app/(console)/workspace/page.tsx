import { Box, KVGrid, LinkButton, StatusBadge } from '@/components/og'
import { PageHead } from '@/components/shell/PageHead'
import { COPY } from '@/lib/copy'
import { usd } from '@/lib/format'
import { can, requireMember } from '@/lib/permissions'
import { clientBrands, workspaceStatusBox } from '@/lib/workspaces'
import { updateWorkspaceAction } from './actions'
import { WorkspaceSettings } from './WorkspaceSettings'

export default async function WorkspacePage() {
  const { workspace: ws, role } = await requireMember('view')
  const status = workspaceStatusBox(ws)
  const brands = ws.type === 'Agency' ? await clientBrands(ws.id) : null
  const locked = ws.status !== 'pending' && role !== 'Global'
  return (
    <>
      <PageHead
        crumb={[{ label: ws.name }, { label: 'Organisation' }, { label: COPY.workspace.crumb }]}
        title={COPY.workspace.title}
        lead={COPY.workspace.lead}
      />
      <div className="two">
        <Box>
          <WorkspaceSettings
            action={updateWorkspaceAction}
            readOnly={!can(role, 'settings')}
            typeCountryLocked={locked}
            initial={{ name: ws.name, type: ws.type, country: ws.country, registrationNumber: ws.registrationNumber ?? '' }}
          />
        </Box>
        <div>
          <Box title={COPY.workspace.statusBox}>
            <KVGrid
              items={[
                { label: COPY.workspace.approval, value: <StatusBadge status={status.approval} /> },
                { label: COPY.workspace.creditLimit, value: usd(status.creditLimitCents) },
                { label: COPY.workspace.channels, value: status.channels },
                { label: COPY.workspace.since, value: status.since },
              ]}
            />
          </Box>
          {brands && (
            <Box title={COPY.workspace.clientsBox} sub={COPY.workspace.clientsSub}>
              {brands.map((b) => (
                <p key={b.brand}>{b.brand} · {COPY.workspace.clientCount(b.campaigns)}</p>
              ))}
              <LinkButton href="/app/campaigns/new?brand=&focus=brand">{COPY.workspace.addClient}</LinkButton>
            </Box>
          )}
        </div>
      </div>
    </>
  )
}
