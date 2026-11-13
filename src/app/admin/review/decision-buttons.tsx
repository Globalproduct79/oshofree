'use client'

import { useState, useTransition } from 'react'
import { COPY } from '@/lib/copy'
import { tokens } from '@/lib/tokens'

type Result = { ok: true } | { error: string }

const btn = 'rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50'

// Approve straight away; the "no" asks for a reason first, in a small inline form.
export function DecisionButtons({
  approve,
  deny,
  denyLabel,
  confirmLabel,
  hideApprove,
  extra,
}: {
  approve: () => Promise<Result>
  deny: (reason: string) => Promise<Result>
  denyLabel: string
  confirmLabel: string
  hideApprove?: boolean
  extra?: React.ReactNode
}) {
  const [asking, setAsking] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function run(fn: () => Promise<Result>) {
    start(async () => {
      const r = await fn()
      setError('error' in r ? r.error : null)
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {!hideApprove && (
          <button type="button" disabled={pending} onClick={() => run(approve)} className={btn}
            style={{ backgroundColor: tokens.accent, color: tokens.card }}>
            {COPY.review.approve}
          </button>
        )}
        {extra}
        {!asking && (
          <button type="button" disabled={pending} onClick={() => setAsking(true)} className={btn}
            style={{ border: `1px solid ${tokens.line}`, color: tokens.ink2 }}>
            {denyLabel}
          </button>
        )}
      </div>
      {asking && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            run(() => deny(reason))
          }}
        >
          <label className="text-xs font-medium" style={{ color: tokens.ink2 }}>
            {COPY.review.reasonLabel}
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              required
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: tokens.line, color: tokens.ink }}
            />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className={btn} style={{ backgroundColor: tokens.red, color: tokens.card }}>
              {confirmLabel}
            </button>
            <button type="button" onClick={() => setAsking(false)} className={btn} style={{ color: tokens.ink2 }}>
              {COPY.review.cancel}
            </button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm" style={{ color: tokens.red }}>
          {error}
        </p>
      )}
    </div>
  )
}
