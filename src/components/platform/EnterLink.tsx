'use client'

import { useTransition } from 'react'
import { switchWorkspaceToAction } from '@/app/app/(console)/switch/actions'

// A link Global follows into an advertiser's workspace: a click enters that workspace and lands on `href` there (D1),
// as the campaign cards on Review do. Used by the Rewards ledger's held rewards, to reach the reward's activity line.
export function EnterLink({ workspaceId, href, title, children }: { workspaceId: string; href: string; title?: string; children: React.ReactNode }) {
  const [, start] = useTransition()
  return (
    <a
      href={href}
      title={title}
      onClick={(e) => {
        e.preventDefault()
        start(() => switchWorkspaceToAction(workspaceId, href))
      }}
    >
      {children}
    </a>
  )
}
