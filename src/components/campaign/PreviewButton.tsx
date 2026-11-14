'use client'

import { useRef, useState } from 'react'
import { PhonePreview, type PreviewState } from '@/components/campaign/PhonePreview'
import { Button, type ButtonVariant } from '@/components/og'
import { COPY } from '@/lib/copy'
import { MARKETS, type Country } from '@/lib/markets'
import type { PreviewOffer } from '@/lib/preview-merge'

type Props = {
  mine: PreviewOffer
  country: Country
  // A server action answering the live offers for the card's country; fetched each time the dialog opens.
  load: () => Promise<PreviewOffer[]>
  label?: string
  variant?: ButtonVariant
  size?: 's' | 'lg'
  className?: string
  // A button of the caller's own (the campaign form's ghost button), handed the opener.
  trigger?: (show: () => void) => React.ReactNode
}

export function PreviewButton({ mine, country, load, label = COPY.preview.button, variant, size, className, trigger }: Props) {
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
      <PhonePreview open={open} onOpenChange={setOpen} live={offers} mine={mine} country={MARKETS[country].name} state={state} />
    </>
  )
}
