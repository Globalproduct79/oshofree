import { COPY } from '@/lib/copy'
import { num } from '@/lib/format'
import type { Funnel as FunnelData } from '@/lib/reports'
import { tokens } from '@/lib/tokens'

const F = COPY.campaign.funnel

type Step = { label: string; value: number; hint?: string }

function FunnelRow({ label, value, hint, max }: Step & { max: number }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[190px_minmax(0,1fr)_56px]">
      <div className="min-w-0">
        <p className="text-sm" style={{ color: tokens.ink2 }}>
          {label}
        </p>
        {hint && (
          <p className="text-xs" style={{ color: tokens.ink3 }}>
            {hint}
          </p>
        )}
      </div>
      <p className="text-right text-sm font-semibold tabular-nums sm:order-last" style={{ color: tokens.ink }}>
        {num(value)}
      </p>
      <div className="col-span-2 h-2.5 overflow-hidden rounded-full sm:col-span-1" style={{ backgroundColor: tokens.line2 }}>
        <div className="h-full rounded-full" style={{ width: `${(value / max) * 100}%`, backgroundColor: tokens.accent }} />
      </div>
    </li>
  )
}

// One channel's funnel: saw → opened → claimed → shared → friend opened → friend claimed.
export function Funnel({ funnel: f }: { funnel: FunnelData }) {
  const ch = COPY.campaign.channel(f.channel)
  const steps: Step[] = [
    { label: F.saw(ch), value: f.saw },
    { label: F.opened(ch), value: f.openedOnChannel },
    {
      label: F.claimed,
      value: f.claimedOnChannel + f.claimedViaLink,
      hint: F.claimedParts(ch, num(f.claimedOnChannel), num(f.claimedViaLink)),
    },
    { label: F.shared, value: f.shares },
    { label: F.friendOpened, value: f.friendOpened },
    { label: F.friendClaimed, value: f.friendClaimed },
  ]
  const max = Math.max(1, ...steps.map((s) => s.value))
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold" style={{ color: tokens.ink }}>
        {ch}
      </h3>
      <ol className="flex flex-col gap-3">
        {steps.map((s) => (
          <FunnelRow key={s.label} {...s} max={max} />
        ))}
      </ol>
    </div>
  )
}
