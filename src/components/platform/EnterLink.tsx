'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { switchWorkspaceToAction } from '@/app/app/(console)/switch/actions'

// Global's way into an advertiser's workspace from a row (the Rewards ledger's held rewards, to the reward's activity
// line): entering is an audited action, not a place, so it is a form button that reads as a link. It submits once: a
// second press while the first is on its way is dropped (one entry, one audit row), and the button is off until the
// page moves. Opening it in a new tab is not offered, so it never lands in the wrong workspace.
export function EnterLink({ workspaceId, href, title, children }: { workspaceId: string; href: string; title?: string; children: React.ReactNode }) {
  const [onSubmit] = useState(submitOnce)
  return (
    <form className="enter" action={switchWorkspaceToAction.bind(null, workspaceId, href)} onSubmit={onSubmit}>
      <EnterButton title={title}>{children}</EnterButton>
    </form>
  )
}

// A form's submit handler that lets the first submit through and stops every later one (React then skips the action).
export function submitOnce(): (e: { preventDefault(): void }) => void {
  let sent = false
  return (e) => {
    if (sent) e.preventDefault()
    sent = true
  }
}

function EnterButton({ title, children }: { title?: string; children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="linkbtn" title={title} disabled={pending} aria-busy={pending || undefined}>
      {children}
    </button>
  )
}
