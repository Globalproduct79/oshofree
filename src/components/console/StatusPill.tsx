import type { EffectiveStatus } from '@/lib/campaign-status'
import { COPY } from '@/lib/copy'
import { tokens } from '@/lib/tokens'

type Status = EffectiveStatus | 'pending' | 'approved' | 'declined'

const colours: Record<Status, { fg: string; bg: string }> = {
  live: { fg: tokens.green, bg: tokens.greenSoft },
  review: { fg: tokens.amber, bg: tokens.amberSoft },
  paused: { fg: tokens.amber, bg: tokens.amberSoft },
  rejected: { fg: tokens.red, bg: tokens.redSoft },
  scheduled: { fg: tokens.blue, bg: tokens.blueSoft },
  ended: { fg: tokens.ink3, bg: tokens.line2 },
  draft: { fg: tokens.ink2, bg: tokens.line2 },
  pending: { fg: tokens.amber, bg: tokens.amberSoft },
  approved: { fg: tokens.green, bg: tokens.greenSoft },
  declined: { fg: tokens.red, bg: tokens.redSoft },
}

export function StatusPill({ status }: { status: Status }) {
  const c = colours[status]
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ color: c.fg, backgroundColor: c.bg }}
    >
      {COPY.status[status]}
    </span>
  )
}
