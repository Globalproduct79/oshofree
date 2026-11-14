'use client'

import { useState, useTransition } from 'react'
import { Button, ToggleRow } from '@/components/og'
import { toast } from '@/components/shell/toast-store'
import { REWARDS_LEDGER as R } from '@/lib/copy-rewards-ledger'
import { rejectPayoutAction, releasePayoutAction, setFraudRuleAction, topUpAction } from './actions'

type Result = { toast: string } | { error: string }

function useRun() {
  const [, start] = useTransition()
  return (act: () => Promise<Result>) =>
    start(async () => {
      const res = await act()
      toast('toast' in res ? res.toast : res.error)
    })
}

export function TopUpForm() {
  const run = useRun()
  const [amount, setAmount] = useState('1000')
  return (
    <>
      <label style={{ display: 'block', marginBottom: 10 }}>
        <span style={{ display: 'block', marginBottom: 6 }}>{R.amountLabel}</span>
        <input
          type="number"
          step="100"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 7, padding: '6px 8px' }}
        />
      </label>
      <Button variant="primary" style={{ width: '100%' }} onClick={() => run(() => topUpAction(Number(amount)))}>
        {R.topUpButton}
      </Button>
    </>
  )
}

export function FraudToggle({ ruleKey, label, sub, enabled }: { ruleKey: string; label: string; sub: string; enabled: boolean }) {
  const run = useRun()
  return <ToggleRow label={label} sub={sub} checked={enabled} onChange={(c) => run(() => setFraudRuleAction(ruleKey, c))} />
}

export function HeldButtons({ id }: { id: string }) {
  const run = useRun()
  return (
    <span style={{ display: 'inline-flex', gap: 6 }}>
      <Button variant="primary" size="s" onClick={() => run(() => releasePayoutAction(id))}>{R.release}</Button>
      <Button variant="ghost" size="s" danger onClick={() => run(() => rejectPayoutAction(id))}>{R.reject}</Button>
    </span>
  )
}
