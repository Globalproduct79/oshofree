'use client'

import { Fragment, useState, useTransition } from 'react'
import {
  approveCampaignAction, approveRevisionAction, previewOffersAction, rejectCampaignAction, rejectRevisionAction,
} from '@/app/admin/review/actions'
import { PreviewButton } from '@/components/campaign/PreviewButton'
import { Button } from '@/components/og'
import { coverStyle } from '@/components/og/cover'
import { REVIEW } from '@/lib/copy-review'
import type { QueueRow as Row } from '@/lib/review'
import { tokens } from '@/lib/tokens'
import { RejectModal } from './RejectModal'
import { say } from './say'

const Q = REVIEW.queue

// One row of "Campaigns waiting" (GLB §2.1 block 3): cover, the offer with its chips, link check and warnings,
// then Approve (disabled until the workspace is approved), Reject and Preview. A revised offer's Approve and
// Reject decide the revision; its campaign keeps running either way.
export function QueueRow({ row }: { row: Row }) {
  const [rejecting, setRejecting] = useState(false)
  const [pending, start] = useTransition()
  const revision = row.kind === 'revision'

  const approve = () =>
    start(async () => void say(await (revision ? approveRevisionAction(row.id) : approveCampaignAction(row.id))))
  const reject = async (code: string, note: string) =>
    say(await (revision ? rejectRevisionAction(row.id, code, note) : rejectCampaignAction(row.id, code, note)))

  return (
    <Fragment>
      <div className="q">
        <div className="cv" style={coverStyle(row.cover.imageUrl, row.cover.color)}>
          {row.cover.videoUrl ? (
            // The first frame (#t=0.1 makes Safari draw it); Preview plays it on the phone.
            <video src={`${row.cover.videoUrl}#t=0.1`} aria-label={Q.video} muted playsInline preload="metadata" />
          ) : (
            !row.cover.imageUrl && row.cover.initials
          )}
        </div>
        <div>
          <div>
            <b>{row.title}</b>
            <span style={{ color: tokens.ink3 }}>
              {Q.sep}
              {row.byline}
              {row.createdBy && (
                <>
                  {Q.sep}
                  {Q.createdBy(row.createdBy)}
                </>
              )}
            </span>
          </div>
          <p>{row.description}</p>
          <div>
            {row.chips.map((chip, i) => (
              <span key={i} className="tagp">
                {chip}
              </span>
            ))}
            {row.link && (
              <span className="tagp" style={{ color: row.link === 'ok' ? tokens.green : tokens.red }}>
                {Q.link[row.link]}
              </span>
            )}
          </div>
          {row.warnings.map((w) => (
            <div key={w} className="warn">
              {w}
            </div>
          ))}
        </div>
        <div className="acts">
          <Button type="button" variant="primary" size="s" disabled={!row.approveEnabled || pending} onClick={approve}>
            {Q.approve}
          </Button>
          <Button type="button" variant="ghost" size="s" disabled={pending} onClick={() => setRejecting(true)}>
            {Q.reject}
          </Button>
          <PreviewButton
            mine={row.preview}
            country={row.country}
            load={() => previewOffersAction(row.country)}
            label={Q.preview}
            variant="ghost"
            size="s"
          />
        </div>
      </div>
      <RejectModal open={rejecting} onClose={() => setRejecting(false)} onReject={reject} />
    </Fragment>
  )
}
