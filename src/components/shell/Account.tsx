'use client'

import { LogOut } from 'lucide-react'
import { signOutAction } from '@/app/app/(console)/switch/actions'
import { SubmitButton } from '@/components/og/SubmitButton'
import { SHELL } from '@/lib/copy-shell'
import { ROW_BUTTON } from './BellPanel'

export type AccountInfo = { name: string; email: string; where: string }

// The topbar's account chip opens this, in the Workspaces panel's shape: who is signed in (their tile, name, email,
// their role here), then Sign out under a rule. The workspace itself is the sidebar's head and the Workspaces panel.
export function Account({
  id,
  open,
  account,
  avatar,
}: {
  id: string
  open: boolean
  account: AccountInfo
  avatar: string
}) {
  if (!open) return null
  const a = SHELL.account
  return (
    <div className="notif on" id={id} data-pop="account" role="region" aria-label={a.title}>
      <div className="h">{a.title}</div>
      <div className="me flex items-center gap-3">
        <span className="tile av" aria-hidden="true">
          {avatar}
        </span>
        <span className="min-w-0 flex-1">
          <b className="truncate">{account.name}</b>
          <small className="truncate">{account.email}</small>
          <small>{account.where}</small>
        </span>
      </div>
      <div className="pf">
        <form action={signOutAction}>
          <SubmitButton plain className={`${ROW_BUTTON} flex items-center gap-3`}>
            <LogOut size={16} aria-hidden="true" className="ico" />
            {a.signOut}
          </SubmitButton>
        </form>
      </div>
    </div>
  )
}
