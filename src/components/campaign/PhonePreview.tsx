'use client'

import { PhoneFrame } from '@/components/campaign/PhoneFrame'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { COPY } from '@/lib/copy'
import { mergeMine, type Mine, type PreviewOffer } from '@/lib/preview-merge'
import { tokens } from '@/lib/tokens'

const P = COPY.preview

export type PreviewState = 'loading' | 'failed' | 'ready'

type Props = {
  offers: PreviewOffer[]
  mine: Mine
  open: boolean
  onOpenChange: (open: boolean) => void
  state?: PreviewState
}

// "On Phoenix": the brand's card, outlined, among the offers delivering in its country right now.
export function PhonePreview({ offers, mine, open, onOpenChange, state = 'ready' }: Props) {
  const note = state === 'loading' ? P.loading : state === 'failed' ? P.failed : null
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto p-6 sm:max-w-[720px]"
        style={{ backgroundColor: tokens.card, borderRadius: tokens.radius }}
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold" style={{ color: tokens.ink }}>
            {P.title}
          </DialogTitle>
          <DialogDescription style={{ color: tokens.ink2 }}>{P.subtitle}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 sm:grid-cols-[260px_minmax(0,1fr)] sm:items-start">
          <PhoneFrame cards={mergeMine(offers, mine)} note={note} />
          <div className="flex flex-col items-start gap-4">
            <p className="text-sm leading-relaxed" style={{ color: tokens.ink2 }}>
              {P.explainer}
            </p>
            <DialogClose render={<Button variant="outline" size="lg" className="px-4" />}>{P.close}</DialogClose>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
