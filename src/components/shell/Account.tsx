'use client'

import { signOutAction } from '@/app/app/(console)/switch/actions'
import { SubmitButton } from '@/components/og/SubmitButton'
import { SHELL } from '@/lib/copy-shell'
import { ROW_BUTTON } from './BellPanel'

export type AccountInfo = { name: string; email: string; where: string }

// The topbar's avatar and name open this: who is signed in (name, email, their role here), then Sign out.
// The workspace itself is the sidebar's head and the Workspaces switcher, not repeated here.
export function Account({ id, open, account }: { id: string; open: boolean; account: AccountInfo }) {
  if (!open) return null
  const a = SHELL.account
  return (
    <div className="notif on" id={id} data-pop="account" role="region" aria-label={a.title}>
      <div className="h">{a.title}</div>
      <div className="me">
        <b>{account.name}</b>
        <small>{account.email}</small>
        <small>{account.where}</small>
      </div>
      <div>
        <form action={signOutAction}>
          <SubmitButton plain className={`${ROW_BUTTON} block`}>
            {a.signOut}
          </SubmitButton>
        </form>
      </div>
    </div>
  )
}
