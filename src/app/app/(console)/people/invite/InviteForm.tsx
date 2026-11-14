'use client'

import { useState, useTransition } from 'react'
import { Box, Button, LinkButton } from '@/components/og'
import { toast } from '@/components/shell/toast-store'
import { PEOPLE } from '@/lib/copy-people'
import { inviteAction } from '../actions'

type Role = 'Owner' | 'Manager' | 'Viewer'
export type Sent = { email: string; url: string }

const PEOPLE_PATH = '/app/people'
const writeClipboard = (text: string) => navigator.clipboard.writeText(text)

// Sends the invite. A refusal is its toast; success says so and hands back the address and the link the action
// made — only the inviter's own response carries it, so two people inviting the same address each see their own.
export async function sendInvite(email: string, role: string, act = inviteAction): Promise<Sent | null> {
  const r = await act(email, role)
  if ('error' in r) {
    toast(r.error === 'ALREADY_MEMBER' ? PEOPLE.alreadyMember : PEOPLE.invalidEmail)
    return null
  }
  toast(PEOPLE.inviteSent)
  return { email: email.trim().toLowerCase(), url: r.url }
}

// The link just made, in a read-only field with Copy (never in a toast: a toast outlives the page, and the link
// is a credential), then the way back to People.
export function InviteSent({ sent }: { sent: Sent }) {
  const [copyFailed, setCopyFailed] = useState(false)
  const copy = async () => {
    try {
      await writeClipboard(sent.url)
      setCopyFailed(false)
      toast(PEOPLE.linkCopied)
    } catch {
      setCopyFailed(true)
    }
  }
  return (
    <Box title={PEOPLE.linkTitle}>
      <div className="stack">
        <p className="sub">{PEOPLE.invitePage.sent(sent.email)}</p>
        <label className="f">
          {PEOPLE.linkLabel}
          <input readOnly value={sent.url} onFocus={(e) => e.currentTarget.select()} />
        </label>
        {copyFailed && (
          <p role="alert" className="sub">
            {PEOPLE.linkBody}
          </p>
        )}
        <div className="btns">
          <Button type="button" variant="primary" onClick={copy}>
            {PEOPLE.copy}
          </Button>
          <LinkButton variant="ghost" href={PEOPLE_PATH}>
            {PEOPLE.invitePage.back}
          </LinkButton>
        </div>
      </div>
    </Box>
  )
}

// People's invite form on its own page: the same action, copy and role choice. Once sent, the box shows the link.
export function InviteForm() {
  const [busy, start] = useTransition()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('Manager')
  const [sent, setSent] = useState<Sent | null>(null)

  if (sent) return <InviteSent sent={sent} />

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
          <Button type="submit" variant="primary" disabled={busy}>
            {PEOPLE.sendInvite}
          </Button>
        </div>
      </form>
    </Box>
  )
}
