'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/og'
import { toast } from '@/components/shell/toast-store'
import { PEOPLE } from '@/lib/copy-people'
import { resendInviteAction, revokeInviteAction } from './actions'
import type { InviteView } from './invite-views'
import { InviteLinkField } from './InviteLink'

type Outcome = 'resent' | 'revoked' | 'gone'

// One invite: the address, its role, who sent it and when its link stops working; Resend and Revoke for those who
// manage people. A Resend's new link shows under the row, to whoever clicked, and nowhere else. `link` is the link
// the invite page's own Send just made.
export function InviteRow({
  invite,
  canManage,
  link = null,
  after,
}: {
  invite: InviteView
  canManage: boolean
  link?: string | null
  after?: (outcome: Outcome) => void
}) {
  const [busy, start] = useTransition()
  const [fresh, setFresh] = useState(link ? { link, expires: invite.expires } : null)
  const [revoked, setRevoked] = useState(false)

  const resend = () =>
    start(async () => {
      const r = await resendInviteAction(invite.id)
      if ('error' in r) {
        toast(PEOPLE.inviteGone)
        setFresh(null)
        after?.('gone')
        return
      }
      setFresh({ link: r.link, expires: r.expires })
      toast(PEOPLE.resent)
      after?.('resent')
    })
  const revoke = () =>
    start(async () => {
      await revokeInviteAction(invite.id)
      setFresh(null)
      setRevoked(true)
      after?.('revoked')
    })

  return (
    <li>
      <span className="av">{invite.email[0].toUpperCase()}</span>
      <div className="nm">
        <b>{invite.email}</b>
        <small>
          {PEOPLE.inviteLine({
            role: invite.role,
            by: invite.invitedBy,
            expires: fresh?.expires ?? invite.expires,
            expired: !fresh && invite.expired,
            revoked,
          })}
        </small>
      </div>
      {canManage && !revoked && (
        <>
          <Button variant="ghost" size="s" disabled={busy} onClick={resend}>
            {PEOPLE.resend}
          </Button>
          <Button variant="ghost" size="s" disabled={busy} onClick={revoke}>
            {PEOPLE.revoke}
          </Button>
        </>
      )}
      {canManage && fresh && (
        <div className="link">
          <InviteLinkField url={fresh.link} />
        </div>
      )}
    </li>
  )
}

// The invites still to be taken up (People's Open invites, Overview's Pending invitations). A Resend, Revoke or a
// refused Resend refreshes the page, so the list and its dates are the server's.
export function InvitesList({ canManage, invites, empty }: { canManage: boolean; invites: InviteView[]; empty: string }) {
  const router = useRouter()
  if (invites.length === 0) return <p className="sub">{empty}</p>
  return (
    <ul className="roles">
      {invites.map((i) => (
        <InviteRow key={i.id} invite={i} canManage={canManage} after={() => router.refresh()} />
      ))}
    </ul>
  )
}
