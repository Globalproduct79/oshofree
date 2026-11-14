import { InvalidInvite } from '@/components/invite/InvalidInvite'
import { inviteContext } from '@/lib/invite-join'
import { SignInForm } from './SignInForm'

type Search = { callbackUrl?: string | string[]; invite?: string | string[] }

// Opened from an invite link, sign-in says which workspace and role the account joins and starts the email at the
// invited address; a link that can no longer be accepted shows the invite page's invalid view instead.
export default async function SignInPage({ searchParams }: { searchParams: Promise<Search> }) {
  const q = await searchParams
  const invite = await inviteContext(q.invite)
  if (invite === 'invalid') return <InvalidInvite />
  return <SignInForm callbackUrl={typeof q.callbackUrl === 'string' ? q.callbackUrl : ''} invite={invite} />
}
