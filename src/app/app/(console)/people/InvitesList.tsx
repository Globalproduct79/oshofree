'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/og'
import { toast } from '@/components/shell/toast-store'
import { PEOPLE } from '@/lib/copy-people'
import { resendInviteAction, revokeInviteAction } from './actions'
import type { InviteView } from './invite-views'
import { InviteLinkField } from './InviteLink'

// An invite row is open (with the link its own Send or Resend just made, if any), or final: revoked by whoever
// clicked Revoke, or gone because it was accepted or revoked meanwhile.
export type RowState = { status: 'open'; fresh: { link: string; expires: string } | null } | { status: 'revoked' } | { status: 'gone' }

const GONE: RowState = { status: 'gone' }

// Resend: the new link and date for the row, the toast says the old link stopped working (never the link itself).
export async function resendRow(id: string, act = resendInviteAction): Promise<RowState> {
  const r = await act(id)
  if ('error' in r) {
    toast(PEOPLE.inviteGone)
    return GONE
  }
  toast(PEOPLE.resent)
  return { status: 'open', fresh: { link: r.link, expires: r.expires } }
}

export async function revokeRow(id: string, act = revokeInviteAction): Promise<RowState> {
  const r = await act(id)
  if (r.error) {
    toast(PEOPLE.inviteGone)
    return GONE
  }
  return { status: 'revoked' }
}

// One invite: the address, its role, who sent it and when its link stops working; Resend and Revoke for those who
// manage people while it is open. A fresh link shows under the row, to whoever's Send or Resend made it. A final
// row has no date and no buttons.
export function InviteRowView({
  invite,
  canManage,
  state,
  busy,
  onResend,
  onRevoke,
}: {
  invite: InviteView
  canManage: boolean
  state: RowState
  busy: boolean
  onResend: () => void
  onRevoke: () => void
}) {
  const open = state.status === 'open' ? state : null
  const line = open
    ? PEOPLE.inviteLine({
        role: invite.role,
        by: invite.invitedBy,
        status: 'open',
        expires: open.fresh?.expires ?? invite.expires,
        expired: !open.fresh && invite.expired,
      })
    : PEOPLE.inviteLine({ role: invite.role, by: invite.invitedBy, status: state.status })
  return (
    <li className="team-row">
      <span className="av">{invite.email[0].toUpperCase()}</span>
      <div className="nm">
        <b>{invite.email}</b>
        <small>{line}</small>
      </div>
      {canManage && open && (
        <div className="ctl">
          <Button variant="ghost" size="s" disabled={busy} onClick={onResend}>
            {PEOPLE.resend}
          </Button>
          <Button variant="ghost" size="s" disabled={busy} onClick={onRevoke}>
            {PEOPLE.revoke}
          </Button>
        </div>
      )}
      {canManage && open?.fresh && (
        <div className="link">
          <InviteLinkField url={open.fresh.link} />
        </div>
      )}
    </li>
  )
}

// The row with its state. `link` is the link the invite page's own Send just made; `after` runs once a Resend or
// Revoke has answered.
export function InviteRow({
  invite,
  canManage,
  link = null,
  after,
}: {
  invite: InviteView
  canManage: boolean
  link?: string | null
  after?: () => void
}) {
  const [busy, start] = useTransition()
  const [state, setState] = useState<RowState>({ status: 'open', fresh: link ? { link, expires: invite.expires } : null })
  const run = (step: (id: string) => Promise<RowState>) =>
    start(async () => {
      setState(await step(invite.id))
      after?.()
    })
  return (
    <InviteRowView
      invite={invite}
      canManage={canManage}
      state={state}
      busy={busy}
      onResend={() => run(resendRow)}
      onRevoke={() => run(revokeRow)}
    />
  )
}

// The invites still to be taken up (People's Open invites, Overview's Pending invitations). Any Resend or Revoke
// answer refreshes the page, so the list and its dates are the server's.
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
