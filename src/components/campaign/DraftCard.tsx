'use client'

import { useEffect, useState } from 'react'
import { CampaignCard, type CardModel } from '@/components/og'
import { peekDraft } from '@/lib/draft-store'
import { draftCard } from './form/draft-card'
import { sameValues, type FormValues } from './form/values'

const NEW = '/app/campaigns/new'

// The New form's unsent draft (kept in this browser per workspace, spec §6.3) as a Draft card on Campaigns home: it
// opens the form, which restores it (Prompt 6). Nothing shows without a draft, or while the page is on the server.
export function DraftCard({ workspaceId, defaults }: { workspaceId: string; defaults: FormValues }) {
  const [card, setCard] = useState<CardModel | null>(null)
  useEffect(() => {
    const draft = peekDraft(workspaceId, defaults)
    setCard(draft && !sameValues(draft, defaults) ? draftCard(draft) : null)
  }, [workspaceId, defaults])
  return card && <CampaignCard campaign={card} href={NEW} />
}
