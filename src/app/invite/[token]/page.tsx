import { acceptInviteAction, signInAsSomeoneElseAction } from './actions'
import { switchWorkspaceAction } from '@/app/app/(console)/switch/actions'
import { AuthFrame } from '@/components/auth/AuthFrame'
import { InvalidInvite } from '@/components/invite/InvalidInvite'
import { LinkButton } from '@/components/og'
import { SubmitButton } from '@/components/og/SubmitButton'
import { auth } from '@/lib/auth'
import { INVITE_PAGE } from '@/lib/copy-people'
import { db } from '@/lib/db'
import { isMember, validInvite } from '@/lib/invitations'

// Who invited you, to which workspace, as what. Signed out: Create an account or Sign in, both carrying the link.
// Signed in: whose account it would join, with Accept as them or Sign in as someone else (the link is the
// credential, so whoever accepts joins — ruling 38). Signed in as someone already in the workspace: it says so and
// opens that workspace instead, leaving the invite for whoever it was meant for. Each button is off while its press is on
// its way (Prompt 10). Drawn in the onboarding column (17 Nov).
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const inv = await validInvite(token)
  if (!inv) {
    return (
      <AuthFrame>
        <InvalidInvite />
      </AuthFrame>
    )
  }
  const inviter = await db.user.findUnique({ where: { id: inv.invitedById }, select: { name: true } })
  const session = await auth()
  // The database decides who is signed in (a JWT can outlive its account).
  const me = session?.user?.id
    ? await db.user.findUnique({ where: { id: session.user.id }, select: { id: true, name: true, email: true } })
    : null
  const already = me ? await isMember(me.id, inv.workspaceId) : false
  const signInOther = (
    <form action={signInAsSomeoneElseAction.bind(null, token)}>
      <SubmitButton variant="ghost" className="w">{INVITE_PAGE.signInOther}</SubmitButton>
    </form>
  )

  if (me && already) {
    return (
      <AuthFrame>
        <div className="box">
          <h1>{INVITE_PAGE.alreadyIn(inv.workspace.name)}</h1>
          <p className="lead">{INVITE_PAGE.signedInAs(me.name || me.email, me.email)}</p>
          <div className="stack">
            <form action={switchWorkspaceAction.bind(null, inv.workspaceId)}>
              <SubmitButton variant="primary" className="w">{INVITE_PAGE.open(inv.workspace.name)}</SubmitButton>
            </form>
            {signInOther}
          </div>
        </div>
      </AuthFrame>
    )
  }

  return (
    <AuthFrame>
      <div className="box">
        <h1>{INVITE_PAGE.headline(inviter?.name ?? 'Someone', inv.workspace.name, inv.role)}</h1>
        {me ? (
          <>
            <p className="lead">{INVITE_PAGE.signedInAs(me.name || me.email, me.email)}</p>
            <div className="stack">
              <form action={acceptInviteAction.bind(null, token)}>
                <SubmitButton variant="primary" className="w">{INVITE_PAGE.acceptAs(me.name || me.email)}</SubmitButton>
              </form>
              {signInOther}
            </div>
          </>
        ) : (
          <>
            <p className="lead">{INVITE_PAGE.signedOutLead}</p>
            <div className="stack">
              <LinkButton variant="primary" className="w" href={`/sign-up?invite=${token}`}>{INVITE_PAGE.createAccount}</LinkButton>
              <LinkButton variant="ghost" className="w" href={`/sign-in?invite=${token}`}>{INVITE_PAGE.signIn}</LinkButton>
            </div>
          </>
        )}
      </div>
    </AuthFrame>
  )
}
