'use client'

import { useTransition } from 'react'
import { switchWorkspaceToAction } from '@/app/app/(console)/switch/actions'
import { CampaignCard } from '@/components/og'
import { REVIEW } from '@/lib/copy-review'
import type { LiveCard } from '@/lib/review'

// "Live now" (GLB §2.1 block 4): every live campaign on the platform. A click enters the campaign's own
// workspace and lands on its page there, so the breadcrumb, nav and credit checks are that workspace's (D1).
export function LiveNow({ cards }: { cards: LiveCard[] }) {
  const [, start] = useTransition()
  return (
    <>
      <div className="sect">
        <h3>{REVIEW.live.title}</h3>
        <span className="n">{cards.length}</span>
      </div>
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
    </>
  )
}
