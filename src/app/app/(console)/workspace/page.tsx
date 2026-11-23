import { Box, LinkButton, StatusBadge } from '@/components/og'
import { PageHead } from '@/components/shell/PageHead'
import { COPY } from '@/lib/copy'
import { SHELL } from '@/lib/copy-shell'
import { initials, usd } from '@/lib/format'
import { MARKETS } from '@/lib/markets'
import { can, requireMember } from '@/lib/permissions'
import { clientBrands, workspaceStatusBox } from '@/lib/workspaces'
import { updateWorkspaceAction } from './actions'
import { WorkspaceSettings } from './WorkspaceSettings'

const W = COPY.workspace

// Workspace (ADV §10, redrawn 17 Nov): who the company is on the platform — the tile the sidebar shows, the name and
// kind, the approval — over a strip of facts; then the details Owners (and Global) can change, and for an agency the
// client brands it runs campaigns for. The head carries no control: Save is the form's.
export default async function WorkspacePage() {
  const { workspace: ws, role } = await requireMember('view')
  const status = workspaceStatusBox(ws)
  const brands = ws.type === 'Agency' ? await clientBrands(ws.id) : null
  const locked = ws.status !== 'pending' && role !== 'Global'
  const details = (
    <Box title={W.detailsTitle} sub={W.subtitle}>
      <WorkspaceSettings
        action={updateWorkspaceAction}
        readOnly={!can(role, 'settings')}
        typeCountryLocked={locked}
        initial={{ name: ws.name, type: ws.type, country: ws.country, registrationNumber: ws.registrationNumber ?? '' }}
      />
    </Box>
  )
  return (
    <>
      <PageHead crumb={[{ label: ws.name }, { label: SHELL.groups.organisation }, { label: W.crumb }]} title={W.title} lead={W.lead} />
      <Box>
        <div className="ident">
          <div className="lg" aria-hidden="true">{initials(ws.name)}</div>
          <div className="nm">
            <b>{ws.name}</b>
            <small>{SHELL.brand.workspaceSub(COPY.workspace.types[ws.type], MARKETS[ws.country].name)}</small>
          </div>
          <StatusBadge status={status.approval} />
        </div>
        <div className="facts">
          <div><small>{W.creditLimit}</small><b>{usd(status.creditLimitCents)}</b></div>
          <div><small>{W.channels}</small><b>{status.channels}</b></div>
          <div><small>{W.since}</small><b>{status.since}</b></div>
          <div><small>{W.registration}</small><b>{ws.registrationNumber?.trim() || W.notGiven}</b></div>
        </div>
      </Box>
      {brands ? (
        <div className="two">
          {details}
          <Box title={W.clientsBox} sub={W.clientsSub}>
            {brands.length > 0 && (
              <div className="clients">
                {brands.map((b) => (
                  <div key={b.brand} className="c">
                    <span>{b.brand}</span>
                    <small>{W.clientCount(b.campaigns)}</small>
                  </div>
                ))}
              </div>
            )}
            {can(role, 'campaigns') && (
              <div className="btns">
                <LinkButton variant="ghost" href="/app/campaigns/new?brand=&focus=brand">{W.addClient}</LinkButton>
              </div>
            )}
          </Box>
        </div>
      ) : (
        <div className="narrow">{details}</div>
      )}
    </>
  )
}
