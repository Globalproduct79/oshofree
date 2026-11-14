'use client'

import { useState, useTransition } from 'react'
import { Button, DataTable } from '@/components/og'
import { toast } from '@/components/shell/toast-store'
import { REWARDS } from '@/lib/copy-rewards'
import { saveCapsAction, setRewardAction } from './actions'

export type RewardRow = { id: string; name: string; country: string; currency: string; rewardLocal: number; paid: string; cap: string }

const inputStyle = { width: 90, border: '1px solid var(--line)', borderRadius: 7, padding: '6px 8px' }

export function RewardsTable({ rows, editable, empty }: { rows: RewardRow[]; editable: boolean; empty: React.ReactNode }) {
  const [, start] = useTransition()
  const commit = (el: HTMLInputElement, id: string) => {
    if (el.value === el.defaultValue) return
    start(async () => {
      const res = await setRewardAction(id, el.valueAsNumber)
      toast('ok' in res ? REWARDS.perCampaign.toast : res.error)
    })
  }
  const body = rows.map((r) => [
    <b key="n">{r.name}</b>,
    r.country,
    editable ? (
      <span key="r">
        <input
          key={`${r.id}-${r.rewardLocal}`}
          type="number"
          min={0}
          step={5}
          style={inputStyle}
          aria-label={`${r.name} airtime per share`}
          defaultValue={r.rewardLocal}
          onBlur={(e) => commit(e.target, r.id)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />{' '}
        {r.currency}
      </span>
    ) : (
      `${r.rewardLocal} ${r.currency}`
    ),
    r.paid,
    r.cap,
  ])
  return <DataTable head={REWARDS.perCampaign.head} rows={body} emptyText={empty} />
}

export type CapsValues = { maxPerSharerPerDay: number; capPct: number; pointsPerShare: number }

export function CapsForm({ initial, editable }: { initial: CapsValues; editable: boolean }) {
  const [v, setV] = useState({
    maxPerSharerPerDay: String(initial.maxPerSharerPerDay),
    capPct: String(initial.capPct),
    pointsPerShare: String(initial.pointsPerShare),
  })
  const [pending, start] = useTransition()
  const C = REWARDS.caps
  const fields = [
    ['maxPerSharerPerDay', C.maxPerDay, 1],
    ['capPct', C.capPct, 1],
    ['pointsPerShare', C.points, 0],
  ] as const
  const save = () =>
    start(async () => {
      const res = await saveCapsAction({
        maxPerSharerPerDay: Number(v.maxPerSharerPerDay),
        capPct: Number(v.capPct),
        pointsPerShare: Number(v.pointsPerShare),
      })
      toast('ok' in res ? C.toast : res.error)
    })
  return (
    <div className="stack">
      {fields.map(([k, label, min]) => (
        <label key={k} className="f">
          {label}
          {editable ? (
            <input type="number" min={min} max={k === 'capPct' ? 100 : undefined} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
          ) : (
            <span style={{ display: 'block', color: 'var(--ink2)' }}>{v[k]}</span>
          )}
        </label>
      ))}
      {editable && (
        <Button variant="primary" disabled={pending} onClick={save}>
          {C.save}
        </Button>
      )}
    </div>
  )
}
