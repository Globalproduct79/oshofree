'use client'

import { pause, resume } from '@/app/app/(console)/campaigns/actions'
import type { ButtonSize } from '@/components/og/Button'
import { SubmitButton } from '@/components/og/SubmitButton'
import { toast } from '@/components/shell/toast-store'
import { CAMPAIGN } from '@/lib/copy-campaign'
import { HOME } from '@/lib/copy-home'

type Running = 'live' | 'paused'

// Pause a live campaign or resume a paused one, then say what happened (ADV §1 "Interactions", §2). A
// refusal, such as resuming over the credit limit, is the toast and nothing changes. The action
// revalidates /app and the campaign page, so the page redraws with the other button and the new note.
export async function pauseOrResume(id: string, status: Running): Promise<void> {
  const res = status === 'live' ? await pause(id) : await resume(id)
  toast('error' in res ? res.error : status === 'live' ? CAMPAIGN.paused : CAMPAIGN.resumed)
}

// Pause (white) or Resume (orange): large on the home hero, regular in the campaign page's head.
export function PauseResume({ id, status, size }: { id: string; status: Running; size?: ButtonSize }) {
  return (
    <form action={() => pauseOrResume(id, status)}>
      {status === 'live' ? (
        <SubmitButton variant="ghost" size={size}>
          {HOME.pause}
        </SubmitButton>
      ) : (
        <SubmitButton variant="primary" size={size}>
          {HOME.resume}
        </SubmitButton>
      )}
    </form>
  )
}
