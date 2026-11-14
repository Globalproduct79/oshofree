import { Box, LinkButton } from '@/components/og'
import { PageHead } from '@/components/shell/PageHead'
import { SHELL } from '@/lib/copy-shell'
import { PEOPLE } from '@/lib/copy-people'
import { members, openInvites } from '@/lib/invitations'
import { can, requireMember } from '@/lib/permissions'
import { inviteViews } from './invite-views'
import { InvitesList } from './InvitesList'
import { RolesBox } from './RolesBox'
import { TeamList } from './TeamList'

// People (ADV §9): the members, the invites still open and what each role can do. Inviting has its own page,
// opened from the head; only Owners and Global see it. No invite's link is sent to this page: Resend hands a new
// one to whoever clicked it.
export default async function PeoplePage() {
  const { user, workspace, role } = await requireMember('view')
  const [people, open] = await Promise.all([members(workspace.id), openInvites(workspace.id)])
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
      <div className="two">
        <div>
          <Box title={PEOPLE.members}>
            <TeamList canManage={canManage} members={people} meId={user.id} />
          </Box>
          <Box title={PEOPLE.openInvites}>
            <InvitesList canManage={canManage} invites={inviteViews(open, workspace.country)} empty={PEOPLE.noOpenInvites} />
          </Box>
        </div>
        <RolesBox />
      </div>
    </>
  )
}
