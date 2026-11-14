'use client'

import { useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { CampaignCard, type CardModel } from '@/components/og'
import { parseDraft, storedDraft } from '@/lib/draft-store'
import { draftCard } from './form/draft-card'
import { sameValues, type FormValues } from './form/values'

const NEW = '/app/campaigns/new'

type Props = { workspaceId: string; defaults: FormValues }

// Another tab saving or clearing a draft redraws home.
function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange)
  return () => window.removeEventListener('storage', onChange)
}

// The New form's unsent draft (kept in this browser per workspace, spec §6.3) as its home card, or null: none on the
// server, none without a draft, none for a draft that is still the form's defaults.
function useDraftCard({ workspaceId, defaults }: Props): CardModel | null {
  const raw = useSyncExternalStore(subscribe, () => storedDraft(workspaceId), () => null)
  return useMemo(() => {
    const draft = parseDraft(raw, workspaceId, defaults)
    return draft && !sameValues(draft, defaults) ? draftCard(draft) : null
  }, [raw, workspaceId, defaults])
}

// The draft as a Draft card on Campaigns home: it opens the form, which restores it (Prompt 6).
export function DraftCard(props: Props) {
  const card = useDraftCard(props)
  return card && <CampaignCard campaign={card} href={NEW} />
}

// Home's empty state ("Nothing on Phoenix yet") is for nothing at all: a draft waiting on home replaces it.
export function EmptyUnlessDraft({ children, ...props }: Props & { children: ReactNode }) {
  return useDraftCard(props) ? null : children
}
