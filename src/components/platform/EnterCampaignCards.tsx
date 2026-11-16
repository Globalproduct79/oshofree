'use client'

import { useState, useTransition } from 'react'
import { switchWorkspaceToAction } from '@/app/app/(console)/switch/actions'
import { CampaignCard } from '@/components/og'
import type { LiveCard } from '@/lib/review'

// Campaign cards that Global opens inside their own workspace: a click enters that workspace and lands on the
// campaign's page there, so the breadcrumb, nav and credit checks are that workspace's (D1). While it enters, the card
// pressed is dimmed and every card ignores another press (one entry, one audit row; Prompt 10).
export function EnterCampaignCards({ cards }: { cards: LiveCard[] }) {
  const [pending, start] = useTransition()
  const [entering, setEntering] = useState<string | null>(null)
  return (
    <div className="cards">
      {cards.map((c) => (
        <CampaignCard
          key={c.id}
          campaign={c}
          href={c.href}
          busy={pending && entering === c.id}
          onClick={(e) => {
            e.preventDefault()
            if (pending) return
            setEntering(c.id)
            start(() => switchWorkspaceToAction(c.workspaceId, c.href))
          }}
        />
      ))}
    </div>
  )
}
