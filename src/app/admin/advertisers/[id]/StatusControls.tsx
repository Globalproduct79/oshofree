'use client'

import type { WorkspaceStatus } from '@prisma/client'
import { useState, useTransition } from 'react'
import { Button, StatusBadge } from '@/components/og'
import { ActionButton, type ActionResult } from '@/components/platform/InlineControls'
import { Modal } from '@/components/shell/Modal'
import { toast } from '@/components/shell/toast-store'
import { ADVERTISERS } from '@/lib/copy-advertisers'
import { tokens } from '@/lib/tokens'
import { approveAction, declineAction, reapproveAction } from './actions'

const D = ADVERTISERS.detail
const M = D.declineDialog

// Decline asks for the reason the owner will read (the prototype declined on one click and told nobody, D4).
function DeclineModal({ id, name, open, onClose }: { id: string; name: string; open: boolean; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const [pending, start] = useTransition()
  return (
    <Modal open={open} onClose={onClose} title={M.title(name)} narrow>
      <form
        className="edit"
        onSubmit={(e) => {
          e.preventDefault()
          start(async () => {
            const res: ActionResult = await declineAction(id, reason)
            toast('toast' in res ? res.toast : res.error)
            if ('toast' in res) onClose()
          })
        }}
      >
        <label>
          {M.reason}
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} required />
        </label>
        <div className="row">
          <Button type="submit" variant="primary" disabled={pending || !reason.trim()}>
            {M.confirm}
          </Button>
          <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>
            {M.cancel}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// The Facts box's status: the pill, then Approve / Decline while pending, the reason and Re-approve once declined.
// An approved workspace has no control here (suspending is not in the prototype).
export function StatusControls({
  id,
  name,
  status,
  declineReason,
}: {
  id: string
  name: string
  status: WorkspaceStatus
  declineReason: string | null
}) {
  const [declining, setDeclining] = useState(false)
  return (
    <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      <StatusBadge status={status} />
      {status === 'pending' && (
        <>
          <ActionButton variant="primary" size="s" act={() => approveAction(id)}>
            {D.approve}
          </ActionButton>
          <Button type="button" variant="ghost" size="s" onClick={() => setDeclining(true)}>
            {D.decline}
          </Button>
          <DeclineModal id={id} name={name} open={declining} onClose={() => setDeclining(false)} />
        </>
      )}
      {status === 'declined' && (
        <>
          {declineReason && <small style={{ color: tokens.ink3, fontWeight: 400 }}>{declineReason}</small>}
          <ActionButton variant="primary" size="s" act={() => reapproveAction(id)}>
            {D.reapprove}
          </ActionButton>
        </>
      )}
    </span>
  )
}
