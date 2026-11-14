import { Box, DataTable } from '@/components/og'
import { PageHead } from '@/components/shell/PageHead'
import { PEOPLE } from '@/lib/copy-people'
import { inviteUrl, members, pendingInvites } from '@/lib/invitations'
import { can, requireMember } from '@/lib/permissions'
import { PeopleClient } from './PeopleClient'

export default async function PeoplePage() {
  const { workspace, role } = await requireMember('view')
  const [people, pending] = await Promise.all([members(workspace.id), pendingInvites(workspace.id)])
  const canManage = can(role, 'people')
  return (
    <>
      <PageHead
        crumb={[{ label: workspace.name }, { label: 'Organisation' }, { label: PEOPLE.crumb }]}
        title={PEOPLE.title}
        lead={PEOPLE.lead}
      />
      <PeopleClient
          canManage={canManage}
          members={people}
          pending={pending.map((p) => ({ id: p.id, email: p.email, role: p.role, url: canManage ? inviteUrl(p.token) : null }))}
      >
        <Box title={PEOPLE.rolesBox}>
          <DataTable head={[]} rows={PEOPLE.roleDescriptions.map(([r, d]) => [<b key={r}>{r}</b>, d])} emptyText="" />
        </Box>
      </PeopleClient>
    </>
  )
}
