'use client'

import { useState, useTransition } from 'react'
import { switchWorkspaceToAction } from '@/app/app/(console)/switch/actions'
import { CampaignCard } from '@/components/og'
import type { LiveCard } from '@/lib/review'

// A plain left click enters the workspace; a click with a modifier (a new tab or window) is left to the browser, which
// opens the card's own address — its advertiser's Platform page, which needs no workspace.
export const entersOnClick = (e: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }) =>
  e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey

// Campaign cards that Global opens inside their own workspace: a click enters that workspace and lands on the
// campaign's page there, so the breadcrumb, nav and credit checks are that workspace's (D1). While it enters, the card
// pressed is dimmed and every card ignores another press (one entry, one audit row; Prompt 10). The card's own href is
// a Platform page (its advertiser's), so a card opened in a new tab or copied never lands in the wrong workspace.
export function EnterCampaignCards({ cards }: { cards: LiveCard[] }) {
  const [pending, start] = useTransition()
  const [entering, setEntering] = useState<string | null>(null)
  return (
    <div className="cards">
      {cards.map((c) => (
        <CampaignCard
          key={c.id}
          campaign={c}
          href={c.platformHref}
          busy={pending && entering === c.id}
          onClick={(e) => {
            if (!entersOnClick(e)) return
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
