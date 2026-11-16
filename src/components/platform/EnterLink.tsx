'use client'

import { useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { switchWorkspaceToAction } from '@/app/app/(console)/switch/actions'

// Global's way into an advertiser's workspace from a row (the Rewards ledger's held rewards, to the reward's activity
// line): entering is an audited action, not a place, so it is a form button that reads as a link. A press while one is
// on its way is dropped (one entry, one audit row) and the button is off meanwhile. Once the press has settled
// without leaving the page (the action failed), or the page comes back from the browser's back-forward cache, the
// button works again. Opening it in a new tab is not offered, so it never lands in the wrong workspace.
export function EnterLink({ workspaceId, href, title, children }: { workspaceId: string; href: string; title?: string; children: React.ReactNode }) {
  const [guard] = useState(submitGuard)
  useEffect(() => {
    const back = (e: PageTransitionEvent) => {
      if (e.persisted) guard.settle()
    }
    window.addEventListener('pageshow', back)
    return () => window.removeEventListener('pageshow', back)
  }, [guard])
  return (
    <form className="enter" action={switchWorkspaceToAction.bind(null, workspaceId, href)} onSubmit={guard.onSubmit}>
      <EnterButton title={title} settle={guard.settle}>
        {children}
      </EnterButton>
    </form>
  )
}

// One press at a time: onSubmit lets a press through and stops every later one (React then skips the action) until
// settle() says the first is over.
export function submitGuard(): { onSubmit: (e: { preventDefault(): void }) => void; settle: () => void } {
  let sent = false
  return {
    onSubmit: (e) => {
      if (sent) e.preventDefault()
      sent = true
    },
    settle: () => {
      sent = false
    },
  }
}

// Inside the form, where its status is known: off while a press is on its way, and the guard settled when it is not.
function EnterButton({ title, settle, children }: { title?: string; settle: () => void; children: React.ReactNode }) {
  const { pending } = useFormStatus()
  useEffect(() => {
    if (!pending) settle()
  }, [pending, settle])
  return (
    <button type="submit" className="linkbtn" title={title} disabled={pending} aria-busy={pending || undefined}>
      {children}
    </button>
  )
}
