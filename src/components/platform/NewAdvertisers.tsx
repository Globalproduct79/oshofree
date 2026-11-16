'use client'

import { Fragment, useState, useTransition } from 'react'
import { approveWorkspaceAction, declineWorkspaceAction } from '@/app/admin/review/actions'
import { Box, Button, DemoPill } from '@/components/og'
import { Modal } from '@/components/shell/Modal'
import { REVIEW } from '@/lib/copy-review'
import { usd } from '@/lib/format'
import type { PendingWorkspace } from '@/lib/review'
import { say } from './say'

const A = REVIEW.advertisers
const D = REVIEW.decline

// Decline asks for the reason the owner will read (the prototype declined on one click and told nobody, D4).
function DeclineModal({ ws, open, onClose }: { ws: PendingWorkspace; open: boolean; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const [pending, start] = useTransition()
  return (
    <Modal open={open} onClose={onClose} title={D.title(ws.name)} narrow>
      <form
        className="edit"
        onSubmit={(e) => {
          e.preventDefault()
          start(async () => {
            if (say(await declineWorkspaceAction(ws.id, reason))) onClose()
          })
        }}
      >
        <label>
          {D.reason}
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} required />
        </label>
        <div className="row">
          <Button type="submit" variant="primary" disabled={pending || !reason.trim()}>
            {D.confirm}
          </Button>
          <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>
            {D.cancel}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function Row({ ws }: { ws: PendingWorkspace }) {
  const [declining, setDeclining] = useState(false)
  const [pending, start] = useTransition()
  return (
    <Fragment>
      <div className="q ws">
        <div>
          <div>
            <b>{ws.name}</b>
            {ws.demo && <> <DemoPill /></>}
            {A.rest(ws.type, ws.country)}
          </div>
          <p>{A.owner(ws.owner ?? A.noOwner, usd(ws.creditCents))}</p>
        </div>
        <div className="acts">
          <Button
            type="button"
            variant="primary"
            size="s"
            disabled={pending}
            onClick={() => start(async () => void say(await approveWorkspaceAction(ws.id)))}
          >
            {A.approve}
          </Button>
          <Button type="button" variant="ghost" size="s" disabled={pending} onClick={() => setDeclining(true)}>
            {A.decline}
          </Button>
        </div>
      </div>
      <DeclineModal ws={ws} open={declining} onClose={() => setDeclining(false)} />
    </Fragment>
  )
}

// "New advertisers" (GLB §2.1 block 2): only while a workspace waits for approval.
export function NewAdvertisers({ workspaces }: { workspaces: PendingWorkspace[] }) {
  if (workspaces.length === 0) return null
  return (
    <Box title={A.title} sub={A.sub}>
      {workspaces.map((ws) => (
        <Row key={ws.id} ws={ws} />
      ))}
    </Box>
  )
}
