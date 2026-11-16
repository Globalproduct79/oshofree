'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button, ToggleRow } from '@/components/og'
import { toast } from '@/components/shell/toast-store'
import { REWARDS_LEDGER as R } from '@/lib/copy-rewards-ledger'
import { rejectPayoutAction, releasePayoutAction, setFraudRuleAction, topUpAction } from './actions'

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

const LEDGER = '/admin/rewards'

// A top-up says so and returns to the ledger, which shows the new balance; a refusal stays on the page to correct.
export async function topUpAndReturn(amount: string, act: (dollars: number) => Promise<Result>, go: (path: string) => void) {
  const res = await act(Number(amount))
  toast('toast' in res ? res.toast : res.error)
  if ('toast' in res) go(LEDGER)
}

// The top-up page's form. The browser's own number checks are off so every refusal is the action's sentence.
export function TopUpForm() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [amount, setAmount] = useState('1000')
  return (
    <form
      className="stack"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        start(() => topUpAndReturn(amount, topUpAction, (path) => router.push(path)))
      }}
    >
      <label className="f">
        {R.amountLabel}
        <input type="number" step="100" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <div className="btns">
        <Button type="submit" aria-busy={pending || undefined} variant="primary" disabled={pending}>
          {R.topUpButton}
        </Button>
      </div>
    </form>
  )
}

export function FraudToggle({ ruleKey, label, sub, enabled }: { ruleKey: string; label: string; sub: string; enabled: boolean }) {
  const [run, pending] = useRun()
  return <ToggleRow label={label} sub={sub} checked={enabled} disabled={pending} onChange={(c) => run(() => setFraudRuleAction(ruleKey, c))} />
}

export function HeldButtons({ id }: { id: string }) {
  const [run, pending] = useRun()
  return (
    <span style={{ display: 'inline-flex', gap: 6 }}>
      <Button variant="primary" size="s" disabled={pending} aria-busy={pending || undefined} onClick={() => run(() => releasePayoutAction(id))}>{R.release}</Button>
      <Button variant="ghost" size="s" danger disabled={pending} aria-busy={pending || undefined} onClick={() => run(() => rejectPayoutAction(id))}>{R.reject}</Button>
    </span>
  )
}
