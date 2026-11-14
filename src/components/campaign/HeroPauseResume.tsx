'use client'

import { useFormStatus } from 'react-dom'
import { pause, resume } from '@/app/app/(console)/campaigns/actions'
import { Button } from '@/components/og/Button'
import { toast } from '@/components/shell/toast-store'
import { CAMPAIGN } from '@/lib/copy-campaign'
import { HOME } from '@/lib/copy-home'

type Running = 'live' | 'paused'

// Pause a live campaign or resume a paused one, then say what happened (ADV §1 "Interactions"). A
// refusal, such as resuming over the credit limit, is the toast and nothing changes. The action
// revalidates /app, so the page redraws with the other button and the new note.
export async function pauseOrResume(id: string, status: Running): Promise<void> {
  const res = status === 'live' ? await pause(id) : await resume(id)
  toast('error' in res ? res.error : status === 'live' ? CAMPAIGN.paused : CAMPAIGN.resumed)
}

function Submit({ status }: { status: Running }) {
  const { pending } = useFormStatus()
  return status === 'live' ? (
    <Button type="submit" variant="ghost" size="lg" disabled={pending}>
      {HOME.pause}
    </Button>
  ) : (
    <Button type="submit" variant="primary" size="lg" disabled={pending}>
      {HOME.resume}
    </Button>
  )
}

// The hero's Pause (white) or Resume (orange), large.
export function HeroPauseResume({ id, status }: { id: string; status: Running }) {
  return (
    <form action={() => pauseOrResume(id, status)}>
      <Submit status={status} />
    </form>
  )
}
