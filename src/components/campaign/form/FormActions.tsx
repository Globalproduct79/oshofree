'use client'

import { Button } from '@/components/ui/button'
import { COPY } from '@/lib/copy'
import { tokens } from '@/lib/tokens'

const C = COPY.campaignForm

type Props = {
  problem: string | null
  pending: boolean
  saved: boolean
  onSave: () => void
  cannotSubmit?: string | null
}

export function FormActions({ problem, pending, saved, onSave, cannotSubmit = null }: Props) {
  const status = pending ? C.saving : saved ? C.saved : cannotSubmit ? null : problem
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      {cannotSubmit && (
        <p className="text-sm font-medium" style={{ color: tokens.red }}>
          {cannotSubmit}
        </p>
      )}
      <div className="flex gap-2">
        {cannotSubmit === null && (
          <Button
            type="submit"
            size="lg"
            disabled={pending || problem !== null}
            className="px-4 hover:opacity-90"
            style={{ backgroundColor: tokens.accent, color: tokens.card }}
          >
            {C.submit}
          </Button>
        )}
        <Button type="button" variant="outline" size="lg" className="px-4" disabled={pending} onClick={onSave}>
          {C.saveDraft}
        </Button>
      </div>
      {status && (
        <p role="status" className="text-sm sm:ml-2" style={{ color: saved && !pending ? tokens.green : tokens.ink3 }}>
          {status}
        </p>
      )}
    </div>
  )
}
