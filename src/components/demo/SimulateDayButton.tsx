'use client'

import { useFormStatus } from 'react-dom'
import { Button } from '@/components/og/Button'
import { toast } from '@/components/shell/toast-store'
import { DEMO, type SimulateError } from '@/lib/copy-demo'

export type SimulateDay = () => Promise<{ ok: true } | { error: SimulateError }>

// Runs the day, then says so with the prototype's toast, or why nothing happened. The action revalidates
// every page, so the one the button sits on redraws with the new numbers.
export async function simulateAndSay(simulate: SimulateDay): Promise<void> {
  const res = await simulate()
  toast('error' in res ? DEMO.errors[res.error] : DEMO.simulated)
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="ghost" disabled={pending}>
      {DEMO.simulate}
    </Button>
  )
}

// "Simulate a day" (white) in the head of Campaigns home, Sharing and Review (ADV §15, GLB §5.2). The page
// renders it only for Global with DEMO_CONTROLS=1; the action checks both again.
export function SimulateDayButton({ action }: { action: SimulateDay }) {
  return (
    <form action={() => simulateAndSay(action)}>
      <Submit />
    </form>
  )
}
