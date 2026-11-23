'use client'

import Link from '@/components/og/Link'
import { useActionState } from 'react'
import { SubmitButton } from '@/components/og/SubmitButton'
import { COPY } from '@/lib/copy'
import type { InviteContext } from '@/lib/invite-join'
import { InviteLine } from '../InviteLine'
import { signInAction } from './actions'

// The email starts at the invited address but stays editable: the link is the credential (ruling 38).
export function SignInForm({ callbackUrl, invite }: { callbackUrl: string; invite: InviteContext | null }) {
  const [error, action] = useActionState(signInAction, null)
  return (
    <div className="box">
      <h1>{COPY.auth.signInTitle}</h1>
      <p className="lead">{COPY.auth.signInLead}</p>
      <form action={action} className="stack">
        {invite && <InviteLine>{invite.joining}</InviteLine>}
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <input type="hidden" name="invite" value={invite?.token ?? ''} />
        <label className="f">
          {COPY.auth.emailLabel}
          <input id="email" name="email" type="email" autoComplete="email" defaultValue={invite?.email} required />
        </label>
        <label className="f">
          {COPY.auth.passwordLabel}
          <input id="password" name="password" type="password" autoComplete="current-password" required />
        </label>
        {error && <p role="alert" className="warn">{error}</p>}
        <SubmitButton variant="primary" className="w">{COPY.auth.signInAction}</SubmitButton>
      </form>
      <p className="alt">
        <Link href={invite ? `/sign-up?invite=${invite.token}` : '/sign-up'}>{COPY.auth.toSignUp}</Link>
      </p>
    </div>
  )
}
