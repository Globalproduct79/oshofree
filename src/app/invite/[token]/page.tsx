import Link from 'next/link'
import { acceptInviteAction, signInAsSomeoneElseAction } from './actions'
import { InvalidInvite } from '@/components/invite/InvalidInvite'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { auth } from '@/lib/auth'
import { INVITE_PAGE } from '@/lib/copy-people'
import { db } from '@/lib/db'
import { validInvite } from '@/lib/invitations'

// Who invited you, to which workspace, as what. Signed out: Create an account or Sign in, both carrying the link.
// Signed in: whose account it would join, with Accept as them or Sign in as someone else (the link is the
// credential, so whoever accepts joins — ruling 38).
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const inv = await validInvite(token)
  if (!inv) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <InvalidInvite />
      </main>
    )
  }
  const inviter = await db.user.findUnique({ where: { id: inv.invitedById }, select: { name: true } })
  const session = await auth()
  // The database decides who is signed in (a JWT can outlive its account).
  const me = session?.user?.id
    ? await db.user.findUnique({ where: { id: session.user.id }, select: { name: true, email: true } })
    : null

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{INVITE_PAGE.headline(inviter?.name ?? 'Someone', inv.workspace.name, inv.role)}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {me ? (
            <>
              <p className="text-sm text-muted-foreground">{INVITE_PAGE.signedInAs(me.name || me.email, me.email)}</p>
              <form action={acceptInviteAction.bind(null, token)}>
                <Button type="submit">{INVITE_PAGE.acceptAs(me.name || me.email)}</Button>
              </form>
              <form action={signInAsSomeoneElseAction.bind(null, token)}>
                <Button type="submit" variant="outline">
                  {INVITE_PAGE.signInOther}
                </Button>
              </form>
            </>
          ) : (
            <>
              <Link href={`/sign-up?invite=${token}`} className="text-sm underline">{INVITE_PAGE.createAccount}</Link>
              <Link href={`/sign-in?invite=${token}`} className="text-sm underline">{INVITE_PAGE.signIn}</Link>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
