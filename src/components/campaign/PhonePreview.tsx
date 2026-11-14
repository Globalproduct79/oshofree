'use client'

import { useState } from 'react'
import { PreviewBody, type LiveState } from '@/components/campaign/PreviewBody'
import { startTab, type PreviewTab } from '@/components/campaign/preview-tabs'
import { Modal } from '@/components/shell/Modal'
import { COPY } from '@/lib/copy'
import type { PreviewCampaign, PreviewOffer } from '@/lib/preview-merge'

const P = COPY.preview

export type PreviewState = LiveState

type Props = {
  campaign: PreviewCampaign
  live: PreviewOffer[]
  open: boolean
  onOpenChange: (open: boolean) => void
  state?: PreviewState
  // The tab to open on (View full size asks for Splash); the campaign's placement when it does not apply.
  initialTab?: PreviewTab
}

// The one preview (Prompt 7), from the campaign page, the form and Global's Review: "On Phoenix" with a tab per format.
// The four placements show the campaign on the Phoenix wall among the offers live in its country now; Landing page
// and Share show the real landing page, inert. Full screen on a phone.
export function PhonePreview({ campaign, live, open, onOpenChange, state = 'ready', initialTab }: Props) {
  if (!open) return null
  return (
    <Modal open onClose={() => onOpenChange(false)} title={P.title} sheet>
      <p className="sub">{P.subtitle}</p>
      {/* Keyed so each opening starts on the tab asked for. */}
      <Tabs key={`${campaign.id}:${campaign.placement}:${initialTab ?? ''}`} {...{ campaign, live, state, onOpenChange, initialTab }} />
    </Modal>
  )
}

function Tabs({ campaign, live, state, onOpenChange, initialTab }: Omit<Props, 'open'> & { state: PreviewState }) {
  const [tab, setTab] = useState<PreviewTab>(() => startTab(campaign.placement, initialTab))
  return <PreviewBody campaign={campaign} tab={tab} live={live} state={state} onTab={setTab} onClose={() => onOpenChange(false)} />
}
