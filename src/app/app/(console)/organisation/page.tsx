import { Box, KVGrid, LinkButton, StatusBadge } from '@/components/og'
import { PageHead } from '@/components/shell/PageHead'
import { COPY } from '@/lib/copy'
import { ORGANISATION as O } from '@/lib/copy-organisation'
import { SHELL } from '@/lib/copy-shell'
import { longDate, usd } from '@/lib/format'
import { members, openInvites } from '@/lib/invitations'
import { MARKETS } from '@/lib/markets'
import { can, requireMember } from '@/lib/permissions'
import { clientBrands } from '@/lib/workspaces'
import { inviteViews } from '../people/invite-views'
import { InvitesList } from '../people/InvitesList'
import { TeamList } from '../people/TeamList'

// Organisation › Overview: who the company is on the platform, who works here and who is still to join. Every
// member sees it; Invite user, the team's controls, Resend and Revoke are for those who manage people (Owners and
// Global), Edit workspace for those who may change its settings. No invite's link is sent to this page.
export default async function OrganisationPage() {
  const { user, workspace: ws, role } = await requireMember('view')
  const [team, open, brands] = await Promise.all([
    members(ws.id),
    openInvites(ws.id),
    ws.type === 'Agency' ? clientBrands(ws.id) : null,
  ])
  const canManage = can(role, 'people')
  const market = MARKETS[ws.country]
  const C = O.company
  return (
    <>
      <PageHead
        crumb={[{ label: ws.name }, { label: SHELL.groups.organisation }, { label: O.crumb }]}
        title={O.title}
        lead={O.lead}
        actions={
          canManage && (
            <LinkButton variant="primary" href="/app/people/invite">
              {O.inviteUser}
            </LinkButton>
          )
        }
      />
      <Box title={C.title}>
        <div className="stack">
          <KVGrid
            items={[
              { label: C.name, value: ws.name },
              { label: C.type, value: COPY.workspace.types[ws.type] },
              { label: C.country, value: market.name },
              { label: C.registration, value: ws.registrationNumber?.trim() || C.notGiven },
              { label: C.approval, value: <StatusBadge status={ws.status} /> },
              { label: C.creditLimit, value: usd(ws.creditLimitCents) },
              { label: C.since, value: longDate(ws.createdAt, market.timezone) },
            ]}
          />
          {brands && (
            <div>
              <b className="subt">{C.clients}</b>
              {brands.length === 0 ? (
                <p className="sub">{C.noClients}</p>
              ) : (
                <p>
                  {brands.map((b) => (
                    <span key={b.brand} className="tagp">
                      {C.client(b.brand, b.campaigns)}
                    </span>
                  ))}
                </p>
              )}
            </div>
          )}
          {can(role, 'settings') && (
            <div className="btns">
              <LinkButton variant="ghost" href="/app/workspace">
                {C.edit}
              </LinkButton>
            </div>
          )}
        </div>
      </Box>
      <Box title={O.team.title}>
        <TeamList canManage={canManage} members={team} meId={user.id} />
      </Box>
      <Box title={O.pending.title}>
        <InvitesList canManage={canManage} invites={inviteViews(open, ws.country)} empty={O.pending.empty} />
      </Box>
    </>
  )
}
