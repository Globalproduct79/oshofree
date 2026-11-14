'use client'

import { useTransition } from 'react'
import { endCampaignAction } from '@/app/app/(console)/campaigns/actions'
import { Button } from '@/components/og/Button'
import { Modal } from '@/components/shell/Modal'
import { toast } from '@/components/shell/toast-store'
import { CAMPAIGN } from '@/lib/copy-campaign'
import { CAMPAIGN_COPY } from '@/lib/copy-report'

const C = CAMPAIGN_COPY.change

// End the campaign and say how much budget it released, or why it could not end (ADV §2). The action
// revalidates the page, which redraws as ended: no Pause, no End, Save disabled.
export async function endNow(id: string): Promise<boolean> {
  const res = await endCampaignAction(id)
  toast('error' in res ? res.error : res.toast)
  return !('error' in res)
}

// The prototype's native confirm as a styled one (spec §6.3), with its question as the title.
export function EndCampaignModal({ id, open, onClose }: { id: string; open: boolean; onClose: () => void }) {
  const [pending, start] = useTransition()
  return (
    <Modal open={open} onClose={onClose} title={CAMPAIGN.endConfirm} narrow>
      <div className="row">
        <Button
          type="button"
          variant="primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await endNow(id)
              onClose()
            })
          }
        >
          {C.endConfirm}
        </Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>
          {C.cancel}
        </Button>
      </div>
    </Modal>
  )
}
