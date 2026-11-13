'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { pause, resume } from '@/app/app/(console)/campaigns/actions'
import { Button } from '@/components/ui/button'
import { COPY } from '@/lib/copy'
import { tokens } from '@/lib/tokens'

// Pause a live campaign or resume a paused one, then redraw the page from the server.
export function PauseResume({ id, status }: { id: string; status: 'live' | 'paused' }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function run() {
    start(async () => {
      const res = await (status === 'live' ? pause : resume)(id)
      if ('error' in res) return setError(res.error)
      setError(null)
      router.refresh()
    })
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button type="button" variant="outline" size="lg" className="px-4" disabled={pending} onClick={run}>
        {status === 'live' ? COPY.campaign.pause : COPY.campaign.resume}
      </Button>
      {error && (
        <span role="alert" className="text-xs" style={{ color: tokens.red }}>
          {error}
        </span>
      )}
    </span>
  )
}
