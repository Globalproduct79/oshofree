'use client'

import { useFormStatus } from 'react-dom'
import { Button } from '@/components/og/Button'
import { toast } from '@/components/shell/toast-store'
import { DEMO } from '@/lib/copy-demo'
import type { DailyResult } from '@/lib/jobs/daily'

export type RunDailyJob = () => Promise<{ ok: true; summary: DailyResult } | { error: 'FORBIDDEN' }>

// Runs the daily job (the cron's run, replayed), then says what happened. The action revalidates every page.
export async function runAndSay(run: RunDailyJob): Promise<void> {
  const res = await run()
  if ('error' in res) return toast(DEMO.dailyForbidden)
  const { summary } = res
  if (summary.skipped) return toast(DEMO.dailySkipped)
  toast(summary.errors.length ? DEMO.ranDailyWithErrors(summary.errors.length) : DEMO.ranDaily)
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="ghost" disabled={pending}>
      {DEMO.runDaily}
    </Button>
  )
}

// "Run daily job" (white) in Review's head. The page renders it only for Global with DEMO_CONTROLS=1; the
// action checks both again.
export function RunDailyJobButton({ action }: { action: RunDailyJob }) {
  return (
    <form action={() => runAndSay(action)}>
      <Submit />
    </form>
  )
}
