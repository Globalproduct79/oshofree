'use client'

import { useState, useTransition } from 'react'
import { changeWithoutReviewAction } from '@/app/app/(console)/campaigns/actions'
import { EndCampaignModal } from '@/components/campaign/EndCampaignModal'
import { Box } from '@/components/og/Box'
import { Button } from '@/components/og/Button'
import { toast } from '@/components/shell/toast-store'
import type { ChangeModel } from '@/lib/campaign-report'
import { CAMPAIGN_COPY } from '@/lib/copy-report'

const C = CAMPAIGN_COPY.change

export type ChangeValues = { budgetUsd: string; endsAt: string; rewardLocal: string }

// Apply budget, end date and reward, and say so or why not (ADV §2 "Save changes"). The action
// revalidates the page; the panel is keyed by the stored values, so it redraws from them.
export async function saveChanges(id: string, v: ChangeValues): Promise<boolean> {
  const res = await changeWithoutReviewAction(id, v)
  toast('error' in res ? res.error : res.toast)
  return !('error' in res)
}

// "Change without review": money and timing, applied at once. Save is off for an ended or rejected
// campaign; End campaign now is there only while live or paused. Without the campaigns capability
// the fields are shown, locked, and there is nothing to press.
export function ChangePanel({ id, change, readOnly }: { id: string; change: ChangeModel; readOnly: boolean }) {
  const [v, setV] = useState<ChangeValues>({
    budgetUsd: String(change.budgetUsd),
    endsAt: change.endsOn,
    rewardLocal: String(change.rewardLocal),
  })
  const [pending, start] = useTransition()
  const [ending, setEnding] = useState(false)
  const set = (k: keyof ChangeValues) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value })

  return (
    <Box title={C.title} sub={C.sub}>
      {/* The browser's step check would refuse a budget off the min + 10 grid; the server judges instead. */}
      <form
        className="edit"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          start(async () => {
            await saveChanges(id, v)
          })
        }}
      >
        <label>
          {C.budget}
          <input type="number" min={change.minBudgetUsd} step={10} value={v.budgetUsd} disabled={readOnly} onChange={set('budgetUsd')} />
        </label>
        <label>
          {C.endDate}
          <input type="date" value={v.endsAt} disabled={readOnly} onChange={set('endsAt')} />
        </label>
        <label>
          {C.reward(change.currency)}
          <input type="number" min={0} step={5} value={v.rewardLocal} disabled={readOnly} onChange={set('rewardLocal')} />
        </label>
        {!readOnly && (
          <Button type="submit" variant="primary" disabled={!change.canSave || pending}>
            {C.save}
          </Button>
        )}
        {!readOnly && change.canEnd && (
          <Button type="button" danger onClick={() => setEnding(true)}>
            {C.end}
          </Button>
        )}
      </form>
      {!readOnly && change.canEnd && <EndCampaignModal id={id} open={ending} onClose={() => setEnding(false)} />}
    </Box>
  )
}
