'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Box, Button, LinkButton } from '@/components/og'
import { toast } from '@/components/shell/toast-store'
import { PEOPLE } from '@/lib/copy-people'
import { inviteAction } from '../actions'

type Role = 'Owner' | 'Manager' | 'Viewer'
export type PendingLink = { email: string; url: string }
export type Sent = { email: string; before: string[] }

const PEOPLE_PATH = '/app/people'
const writeClipboard = (text: string) => navigator.clipboard.writeText(text)

// The link the invite just made: the open invite for that address that was not there before sending. A second
// invite to the same address replaces the first link, so the old one is never shown while the page catches up.
export function newInviteLink(pending: PendingLink[], sent: Sent | null): string | null {
  if (!sent) return null
  return pending.find((p) => p.email === sent.email && !sent.before.includes(p.url))?.url ?? null
}

// People's invite form on its own page: the same action, copy and role choice. Once sent, the page refreshes
// with the new invite and the box shows its link to copy (a toast would outlive the page; the link is a
// credential), then the way back to People.
export function InviteForm({ pending }: { pending: PendingLink[] }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('Manager')
  const [sent, setSent] = useState<Sent | null>(null)
  const [copyFailed, setCopyFailed] = useState(false)
  const link = newInviteLink(pending, sent)

  const send = () =>
    start(async () => {
      const before = pending.map((p) => p.url)
      const r = await inviteAction(email, role)
      if ('error' in r) return toast(r.error === 'ALREADY_MEMBER' ? PEOPLE.alreadyMember : PEOPLE.invalidEmail)
      toast(PEOPLE.inviteSent)
      // The address as the invite stores it.
      setSent({ email: email.trim().toLowerCase(), before })
      router.refresh()
    })
  const copy = async (url: string) => {
    try {
      await writeClipboard(url)
      setCopyFailed(false)
      toast(PEOPLE.linkCopied)
    } catch {
      setCopyFailed(true)
    }
  }

  if (sent && link) {
    return (
      <Box title={PEOPLE.linkTitle}>
        <div className="stack">
          <p className="sub">{PEOPLE.invitePage.sent(sent.email)}</p>
          <label className="f">
            {PEOPLE.linkLabel}
            <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
          </label>
          {copyFailed && (
            <p role="alert" className="sub">
              {PEOPLE.linkBody}
            </p>
          )}
          <div className="btns">
            <Button type="button" variant="primary" onClick={() => copy(link)}>
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

  return (
    <Box title={PEOPLE.invite}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          send()
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
          <Button type="submit" variant="primary" disabled={busy || sent !== null}>
            {PEOPLE.sendInvite}
          </Button>
        </div>
      </form>
    </Box>
  )
}
