'use client'

import Link from '@/components/og/Link'
import { useActionState } from 'react'
import { SubmitButton } from '@/components/og/SubmitButton'
import { COPY } from '@/lib/copy'
import type { InviteContext } from '@/lib/invite-join'
import { InviteLine } from '../InviteLine'
import { signUpAction } from './actions'

// The email starts at the invited address but stays editable: the link is the credential (ruling 38).
export function SignUpForm({ invite }: { invite: InviteContext | null }) {
  const [error, action] = useActionState(signUpAction, null)
  return (
    <div className="box">
      <h1>{COPY.auth.signUpTitle}</h1>
      <p className="lead">{COPY.auth.signUpLead}</p>
      <form action={action} className="stack">
        {invite && <InviteLine>{invite.joining}</InviteLine>}
        <input type="hidden" name="invite" value={invite?.token ?? ''} />
        <label className="f">
          {COPY.auth.nameLabel}
          <input id="name" name="name" autoComplete="name" required />
        </label>
        <label className="f">
          {COPY.auth.emailLabel}
          <input id="email" name="email" type="email" autoComplete="email" defaultValue={invite?.email} required />
        </label>
        <label className="f">
          {COPY.auth.passwordLabel} <small>{COPY.auth.passwordHint}</small>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        </label>
        {error && <p role="alert" className="warn">{error}</p>}
        <SubmitButton variant="primary" className="w">{COPY.auth.signUpAction}</SubmitButton>
      </form>
      <p className="alt">
        <Link href={invite ? `/sign-in?invite=${invite.token}` : '/sign-in'}>{COPY.auth.toSignIn}</Link>
      </p>
    </div>
  )
}
