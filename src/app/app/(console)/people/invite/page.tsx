import { redirect } from 'next/navigation'
import { LinkButton } from '@/components/og'
import { PageHead } from '@/components/shell/PageHead'
import { SHELL } from '@/lib/copy-shell'
import { PEOPLE } from '@/lib/copy-people'
import { can, requireMember } from '@/lib/permissions'
import { RolesBox } from '../RolesBox'
import { InviteForm } from './InviteForm'

const PEOPLE_PATH = '/app/people'

// Organisation › People › Invite: the invite form on a page of its own, beside what each role can do; once sent, the
// pending invite with its link, Resend and Revoke, and the way back to People. Owners and Global only; anyone else is
// sent back to People. No open invite's link is sent to this page: the only links it shows are the ones its own
// invite and resend actions hand back.
export default async function InvitePage() {
  const { workspace, role } = await requireMember('view')
  if (!can(role, 'people')) redirect(PEOPLE_PATH)
  return (
    <>
      <PageHead
        crumb={[
          { label: workspace.name },
          { label: SHELL.groups.organisation },
          { label: PEOPLE.crumb, href: PEOPLE_PATH },
          { label: PEOPLE.invitePage.crumb },
        ]}
        title={PEOPLE.invitePage.title}
        lead={PEOPLE.invitePage.lead}
        actions={
          <LinkButton variant="ghost" href={PEOPLE_PATH}>
            {SHELL.nav.people}
          </LinkButton>
        }
      />
      <div className="two">
        <InviteForm />
        <RolesBox />
      </div>
    </>
  )
}
