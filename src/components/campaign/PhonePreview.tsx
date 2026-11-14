'use client'

import { PhoneFrame } from '@/components/campaign/PhoneFrame'
import { Button } from '@/components/og'
import { Modal } from '@/components/shell/Modal'
import { COPY } from '@/lib/copy'
import type { PreviewOffer } from '@/lib/preview-merge'

const P = COPY.preview

export type PreviewState = 'loading' | 'failed' | 'ready'

type Props = {
  live: PreviewOffer[]
  mine: PreviewOffer
  country: string
  open: boolean
  onOpenChange: (open: boolean) => void
  state?: PreviewState
}

// "On Phoenix": the campaign's card, outlined, among the offers delivering in its country right now.
export function PhonePreview({ live, mine, country, open, onOpenChange, state = 'ready' }: Props) {
  const note = state === 'loading' ? P.loading : state === 'failed' ? P.failed : null
  return (
    <Modal open={open} onClose={() => onOpenChange(false)} title={P.title}>
      <div style={{ color: 'var(--ink3)', fontSize: 13, lineHeight: 1.5 }}>{P.subtitle}</div>
      <div className="prev" style={{ marginTop: 16 }}>
        <PhoneFrame mine={mine} live={live} country={country} />
        <div>
          <p style={{ color: 'var(--ink2)', lineHeight: 1.6, margin: '0 0 16px' }}>{P.explainer}</p>
          {note && (
            <p role="status" style={{ color: 'var(--ink3)', fontSize: 13, margin: '0 0 16px' }}>
              {note}
            </p>
          )}
          <Button type="button" variant="dark" onClick={() => onOpenChange(false)}>
            {P.close}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
