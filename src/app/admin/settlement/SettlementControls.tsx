'use client'

import { useTransition } from 'react'
import { Button } from '@/components/og'
import { toast } from '@/components/shell/toast-store'
import { SETTLEMENT } from '@/lib/copy-settlement'
import { markStatementPaidAction, setShareAction } from './actions'

type Result = { toast: string } | { error: string }

// Runs one action and toasts its answer; `pending` keeps the control off until it answers (Prompt 10).
function useRun(): [(act: () => Promise<Result>) => void, boolean] {
  const [pending, start] = useTransition()
  const run = (act: () => Promise<Result>) =>
    start(async () => {
      const res = await act()
      toast('toast' in res ? res.toast : res.error)
    })
  return [run, pending]
}

export function ShareInput({ share }: { share: number }) {
  const [run] = useRun()
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', marginBottom: 6 }}>{SETTLEMENT.shareLabel}</span>
      <input
        key={share}
        type="number"
        step="0.05"
        min="0"
        max="1"
        style={{ width: 110, border: '1px solid var(--line)', borderRadius: 7, padding: '6px 8px' }}
        defaultValue={share}
        onBlur={(e) => {
          if (e.target.value !== e.target.defaultValue) run(() => setShareAction(e.target.valueAsNumber))
        }}
      />
    </label>
  )
}

export function MarkPaid({ id }: { id: string }) {
  const [run, pending] = useRun()
  return (
    <Button variant="ghost" size="s" disabled={pending} aria-busy={pending || undefined} onClick={() => run(() => markStatementPaidAction(id))}>
      {SETTLEMENT.markPaid}
    </Button>
  )
}
