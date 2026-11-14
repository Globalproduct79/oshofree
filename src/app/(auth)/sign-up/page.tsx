import { InvalidInvite } from '@/components/invite/InvalidInvite'
import { INVITE_PAGE } from '@/lib/copy-people'
import { inviteContext } from '@/lib/invite-join'
import { SignUpForm } from './SignUpForm'

// Opened from an invite link, sign-up says which workspace and role the new account joins and starts the email at
// the invited address; a link that can no longer be accepted shows the invite page's invalid view instead, with a way on
// without the invite.
export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ invite?: string | string[] }> }) {
  const invite = await inviteContext((await searchParams).invite)
  if (invite === 'invalid') return <InvalidInvite way={{ href: '/sign-up', label: INVITE_PAGE.signUpWithout }} />
  return <SignUpForm invite={invite} />
}
