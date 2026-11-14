'use client'

import { useTransition } from 'react'
import { Button } from '@/components/og'
import { toast } from '@/components/shell/toast-store'
import { MONEY } from '@/lib/copy-money'
import { requestCreditAction } from './actions'

export function RequestCredit() {
  const [pending, start] = useTransition()
  return (
    <Button
      variant="ghost"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await requestCreditAction()
          toast(MONEY.requestSent)
        })
      }
    >
      {MONEY.billing.moreAction}
    </Button>
  )
}
