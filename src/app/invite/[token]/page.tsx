import Link from 'next/link'
import { acceptInviteAction } from './actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { auth } from '@/lib/auth'
import { INVITE_PAGE } from '@/lib/copy-people'
import { db } from '@/lib/db'
import { findInvite } from '@/lib/invitations'

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const inv = await findInvite(token)
  const valid = inv && !inv.acceptedAt && !inv.revokedAt && inv.expiresAt.getTime() > Date.now()
  const inviter = valid ? await db.user.findUnique({ where: { id: inv.invitedById }, select: { name: true } }) : null
  const session = valid ? await auth() : null
  const signedIn = Boolean(session?.user?.id)

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            {valid ? INVITE_PAGE.headline(inviter?.name ?? 'Someone', inv.workspace.name, inv.role) : INVITE_PAGE.invalid}
          </CardTitle>
        </CardHeader>
        {valid && (
          <CardContent className="flex flex-col gap-3">
            {signedIn ? (
              <form action={acceptInviteAction.bind(null, token)}>
                <Button type="submit">{INVITE_PAGE.join(inv.workspace.name)}</Button>
              </form>
            ) : (
              <>
                <Link href={`/sign-up?invite=${token}`} className="text-sm underline">{INVITE_PAGE.createAccount}</Link>
                <Link href={`/sign-in?invite=${token}`} className="text-sm underline">{INVITE_PAGE.signIn}</Link>
              </>
            )}
          </CardContent>
        )}
      </Card>
    </main>
  )
}
