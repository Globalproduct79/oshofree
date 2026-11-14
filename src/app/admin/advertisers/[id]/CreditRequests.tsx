'use client'

import { useState } from 'react'
import { DataTable } from '@/components/og'
import { ActionButton, fieldStyle } from '@/components/platform/InlineControls'
import type { AdvertiserRequest } from '@/lib/advertisers'
import { ADVERTISERS } from '@/lib/copy-advertisers'
import { tokens } from '@/lib/tokens'
import { decideCreditAction } from './actions'

const D = ADVERTISERS.detail

// An empty field is no number (Number('') would be 0, a limit of nothing).
const dollarsOf = (v: string) => (v.trim() === '' ? Number.NaN : Number(v))

// Open "Request a higher limit"s, oldest first: the new limit starts at the current one; Approve sets what is
// typed and tells the owner, Dismiss leaves the limit alone.
export function CreditRequests({ requests, limitDollars }: { requests: AdvertiserRequest[]; limitDollars: number }) {
  const [limits, setLimits] = useState<Record<string, string>>({})
  const rows = requests.map((r) => [
    <b key="w">{r.requester}</b>,
    <span key="n" style={{ color: r.note ? tokens.ink2 : tokens.ink3 }}>{r.note ?? D.noNote}</span>,
    r.sent,
    <input
      key="l"
      type="number"
      step={100}
      min={0}
      aria-label={D.newLimitLabel(r.requester)}
      value={limits[r.id] ?? String(limitDollars)}
      onChange={(e) => setLimits((all) => ({ ...all, [r.id]: e.target.value }))}
      style={{ ...fieldStyle, width: 96 }}
    />,
    <span key="a" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
      <ActionButton
        variant="primary"
        size="s"
        act={() => decideCreditAction(r.id, 'approved', dollarsOf(limits[r.id] ?? String(limitDollars)))}
      >
        {D.approveRequest}
      </ActionButton>
      <ActionButton size="s" act={() => decideCreditAction(r.id, 'dismissed')}>
        {D.dismiss}
      </ActionButton>
    </span>,
  ])
  return <DataTable head={D.requestsHead} rows={rows} emptyText={D.noRequests} />
}
