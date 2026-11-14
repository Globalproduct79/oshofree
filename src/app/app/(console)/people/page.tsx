import { LinkButton } from '@/components/og'
import { PageHead } from '@/components/shell/PageHead'
import { SHELL } from '@/lib/copy-shell'
import { PEOPLE } from '@/lib/copy-people'
import { inviteUrl, members, pendingInvites } from '@/lib/invitations'
import { can, requireMember } from '@/lib/permissions'
import { PeopleClient } from './PeopleClient'
import { RolesBox } from './RolesBox'

// People (ADV §9): the members, the invites still open and what each role can do. Inviting has its own page,
// opened from the head; only Owners and Global see it.
export default async function PeoplePage() {
  const { workspace, role } = await requireMember('view')
  const [people, pending] = await Promise.all([members(workspace.id), pendingInvites(workspace.id)])
  const canManage = can(role, 'people')
  return (
    <>
      <PageHead
        crumb={[{ label: workspace.name }, { label: SHELL.groups.organisation }, { label: PEOPLE.crumb }]}
        title={PEOPLE.title}
        lead={PEOPLE.lead}
        actions={
          canManage && (
            <LinkButton variant="primary" href="/app/people/invite">
              {PEOPLE.inviteSomeone}
            </LinkButton>
          )
        }
      />
      <PeopleClient
        canManage={canManage}
        members={people}
        pending={pending.map((p) => ({ id: p.id, email: p.email, role: p.role, url: canManage ? inviteUrl(p.token) : null }))}
      >
        <RolesBox />
      </PeopleClient>
    </>
  )
}
