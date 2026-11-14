import { redirect } from 'next/navigation'
import { LinkButton } from '@/components/og'
import { PageHead } from '@/components/shell/PageHead'
import { SHELL } from '@/lib/copy-shell'
import { PEOPLE } from '@/lib/copy-people'
import { can, requireMember } from '@/lib/permissions'
import { RolesBox } from '../RolesBox'
import { InviteForm } from './InviteForm'

const PEOPLE_PATH = '/app/people'

// People › Invite someone: the invite form on a page of its own (it was a box on People), beside what each role
// can do. Owners and Global only; anyone else is sent back to People. No open invite's link is sent to this page:
// the only link it shows is the one its own invite action hands back.
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
