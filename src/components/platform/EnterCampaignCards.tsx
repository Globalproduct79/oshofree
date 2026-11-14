'use client'

import { useTransition } from 'react'
import { switchWorkspaceToAction } from '@/app/app/(console)/switch/actions'
import { CampaignCard } from '@/components/og'
import type { LiveCard } from '@/lib/review'

// Campaign cards that Global opens inside their own workspace: a click enters that workspace and lands on the
// campaign's page there, so the breadcrumb, nav and credit checks are that workspace's (D1).
export function EnterCampaignCards({ cards }: { cards: LiveCard[] }) {
  const [, start] = useTransition()
  return (
    <div className="cards">
      {cards.map((c) => (
        <CampaignCard
          key={c.id}
          campaign={c}
          href={c.href}
          onClick={(e) => {
            e.preventDefault()
            start(() => switchWorkspaceToAction(c.workspaceId, c.href))
          }}
        />
      ))}
    </div>
  )
}
