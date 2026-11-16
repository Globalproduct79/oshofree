'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { SubmitButton } from '@/components/og/SubmitButton'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { COPY } from '@/lib/copy'
import type { InviteContext } from '@/lib/invite-join'
import { InviteLine } from '../InviteLine'
import { signInAction } from './actions'

// The email starts at the invited address but stays editable: the link is the credential (ruling 38).
export function SignInForm({ callbackUrl, invite }: { callbackUrl: string; invite: InviteContext | null }) {
  const [error, action] = useActionState(signInAction, null)
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{COPY.auth.signInTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          {invite && <InviteLine>{invite.joining}</InviteLine>}
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <input type="hidden" name="invite" value={invite?.token ?? ''} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">{COPY.auth.emailLabel}</Label>
            <Input id="email" name="email" type="email" autoComplete="email" defaultValue={invite?.email} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">{COPY.auth.passwordLabel}</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <SubmitButton plain className={buttonVariants()}>{COPY.auth.signInAction}</SubmitButton>
          <Link href={invite ? `/sign-up?invite=${invite.token}` : '/sign-up'} className="text-sm text-muted-foreground underline">{COPY.auth.toSignUp}</Link>
        </form>
      </CardContent>
    </Card>
  )
}
