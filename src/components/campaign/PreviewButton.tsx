'use client'

import { useRef, useState } from 'react'
import { PhonePreview, type PreviewState } from '@/components/campaign/PhonePreview'
import { Button } from '@/components/ui/button'
import { COPY } from '@/lib/copy'
import type { OfferDto } from '@/lib/offers'
import type { Mine } from '@/lib/preview-merge'
import { cn } from '@/lib/utils'

type Props = {
  mine: Mine
  // A server action answering the live offers for the card's country; fetched each time the dialog opens.
  load: () => Promise<OfferDto[]>
  label?: string
  size?: 'default' | 'lg'
  className?: string
}

export function PreviewButton({ mine, load, label = COPY.preview.button, size = 'lg', className }: Props) {
  const [open, setOpen] = useState(false)
  const [offers, setOffers] = useState<OfferDto[]>([])
  const [state, setState] = useState<PreviewState>('loading')
  const latest = useRef(0)

  function show() {
    const ask = ++latest.current
    setOpen(true)
    setState('loading')
    // Only the latest opening may fill the dialog.
    const settle = (o: OfferDto[], next: PreviewState) => {
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
      <Button type="button" variant="outline" size={size} className={cn('px-4', className)} onClick={show}>
        {label}
      </Button>
      <PhonePreview open={open} onOpenChange={setOpen} offers={offers} mine={mine} state={state} />
    </>
  )
}
