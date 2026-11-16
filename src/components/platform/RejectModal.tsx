'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/og'
import { Modal } from '@/components/shell/Modal'
import { REJECT_REASONS } from '@/lib/copy-campaign'
import { REVIEW } from '@/lib/copy-review'

const J = REVIEW.reject
const REASONS = Object.entries(REJECT_REASONS)

// The prototype's native prompt as a styled dialog (D3, spec §6.4): a reason code, required, and a note,
// prefilled and optional. The advertiser reads "{reason}: {note}".
export function RejectModal({
  open,
  onClose,
  onReject,
}: {
  open: boolean
  onClose: () => void
  onReject: (code: string, note: string) => Promise<boolean>
}) {
  const [code, setCode] = useState('')
  const [note, setNote] = useState<string>(J.noteDefault)
  const [pending, start] = useTransition()
  return (
    <Modal open={open} onClose={onClose} title={J.title} narrow>
      <form
        className="edit"
        onSubmit={(e) => {
          e.preventDefault()
          start(async () => {
            if (await onReject(code, note)) onClose()
          })
        }}
      >
        <label>
          {J.code}
          <select value={code} onChange={(e) => setCode(e.target.value)} required>
            <option value="" disabled>
              {J.choose}
            </option>
            {REASONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {J.note}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
        </label>
        <div className="row">
          <Button type="submit" aria-busy={pending || undefined} variant="primary" disabled={pending || !code}>
            {J.confirm}
          </Button>
          <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>
            {J.cancel}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
