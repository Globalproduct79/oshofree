'use client'

import type { Role } from '@prisma/client'
import { useState, useTransition } from 'react'
import { Box, Button, LinkButton } from '@/components/og'
import { toast } from '@/components/shell/toast-store'
import { PEOPLE } from '@/lib/copy-people'
import { inviteAction } from '../actions'
import { InviteRow } from '../InvitesList'

export type Sent = { id: string; email: string; role: Role; expires: string; url: string }

const PEOPLE_PATH = '/app/people'

// Sends the invite. A refusal is its toast; success says so and hands back the pending invite and the link the
// action made — only the inviter's own response carries it, so two people inviting the same address each see their own.
export async function sendInvite(email: string, role: string, act = inviteAction): Promise<Sent | null> {
  const r = await act(email, role)
  if ('error' in r) {
    toast(r.error === 'ALREADY_MEMBER' ? PEOPLE.alreadyMember : PEOPLE.invalidEmail)
    return null
  }
  toast(PEOPLE.inviteSent)
  return { id: r.id, email: r.email, role: r.role, expires: r.expires, url: r.url }
}

// The invite just sent, as the open-invite row People lists, with its link in a read-only field and Copy (never in a
// toast: a toast outlives the page, and the link is a credential), Resend and Revoke; then Invite another (an empty
// form) or Back to People.
export function InviteSent({ sent, onAnother }: { sent: Sent; onAnother: () => void }) {
  return (
    <Box title={PEOPLE.invitePage.pendingTitle}>
      <div className="stack">
        <p className="sub">{PEOPLE.invitePage.sent(sent.email)}</p>
        <ul className="roles">
          <InviteRow
            invite={{ id: sent.id, email: sent.email, role: sent.role, invitedBy: null, expires: sent.expires, expired: false }}
            canManage
            link={sent.url}
          />
        </ul>
        <div className="btns">
          <Button type="button" variant="ghost" onClick={onAnother}>
            {PEOPLE.invitePage.another}
          </Button>
          <LinkButton variant="ghost" href={PEOPLE_PATH}>
            {PEOPLE.invitePage.back}
          </LinkButton>
        </div>
      </div>
    </Box>
  )
}

// The invite form on its own page. Once sent, the box shows the pending invite; Invite another brings back an
// empty form.
export function InviteForm() {
  const [busy, start] = useTransition()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('Manager')
  const [sent, setSent] = useState<Sent | null>(null)

  const another = () => {
    setEmail('')
    setRole('Manager')
    setSent(null)
  }

  if (sent) return <InviteSent key={sent.id} sent={sent} onAnother={another} />

  return (
    <Box title={PEOPLE.invite}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          start(async () => setSent(await sendInvite(email, role)))
        }}
      >
        <label className="f">
          {PEOPLE.emailLabel}
          <input value={email} placeholder={PEOPLE.emailPlaceholder} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="f">
          {PEOPLE.roleLabel}
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option>Manager</option>
            <option>Viewer</option>
            <option>Owner</option>
          </select>
        </label>
        <div className="btns">
          <Button type="submit" aria-busy={busy || undefined} variant="primary" disabled={busy}>
            {PEOPLE.sendInvite}
          </Button>
        </div>
      </form>
    </Box>
  )
}
