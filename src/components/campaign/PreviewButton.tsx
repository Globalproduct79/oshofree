'use client'

import { useRef, useState } from 'react'
import { PhonePreview, type PreviewState } from '@/components/campaign/PhonePreview'
import type { PreviewTab } from '@/components/campaign/preview-tabs'
import { Button, type ButtonVariant } from '@/components/og'
import { COPY } from '@/lib/copy'
import type { PreviewCampaign, PreviewOffer } from '@/lib/preview-merge'

type Props = {
  campaign: PreviewCampaign
  // A server action answering the live offers for the campaign's country; fetched each time the dialog opens.
  load: () => Promise<PreviewOffer[]>
  label?: string
  variant?: ButtonVariant
  size?: 's' | 'lg'
  className?: string
  // The tab to open on; the campaign's placement by default.
  initialTab?: PreviewTab
  // A button of the caller's own (the campaign form's ghost button), handed the opener.
  trigger?: (show: () => void) => React.ReactNode
}

// Opens the one preview (PhonePreview) from the campaign page, the form and Global's Review.
export function PreviewButton({ campaign, load, label = COPY.preview.button, variant, size, className, initialTab, trigger }: Props) {
  const [open, setOpen] = useState(false)
  const [offers, setOffers] = useState<PreviewOffer[]>([])
  const [state, setState] = useState<PreviewState>('loading')
  const latest = useRef(0)

  function show() {
    const ask = ++latest.current
    setOpen(true)
    setState('loading')
    // Only the latest opening may fill the dialog.
    const settle = (o: PreviewOffer[], next: PreviewState) => {
      if (ask !== latest.current) return
      setOffers(o)
      setState(next)
    }
    load().then(
      (o) => settle(o, 'ready'),
      () => settle([], 'failed'),
    )
  }

  return (
    <>
      {trigger ? (
        trigger(show)
      ) : (
        <Button type="button" variant={variant} size={size} className={className} onClick={show}>
          {label}
        </Button>
      )}
      <PhonePreview open={open} onOpenChange={setOpen} live={offers} campaign={campaign} state={state} initialTab={initialTab} />
    </>
  )
}
