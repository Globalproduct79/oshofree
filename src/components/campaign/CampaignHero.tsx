import type { Campaign } from '@prisma/client'
import { CampaignThumb } from '@/components/campaign/CampaignThumb'
import { PauseResume } from '@/components/campaign/PauseResume'
import { LinkButton } from '@/components/console/LinkButton'
import { NumberTile } from '@/components/console/NumberTile'
import { StatusPill } from '@/components/console/StatusPill'
import type { EffectiveStatus } from '@/lib/campaign-status'
import { COPY } from '@/lib/copy'
import { num, shortDate } from '@/lib/format'
import type { homeNumbers } from '@/lib/reports'
import { tokens } from '@/lib/tokens'

const H = COPY.home
type Numbers = Awaited<ReturnType<typeof homeNumbers>>

// Day 1 is the first day of the flight; before it starts, say when it does.
function pace(c: Campaign, n: Numbers, now: Date) {
  if (now < c.startsAt) return { text: H.starts(shortDate(c.startsAt), n.daysTotal), day: 0 }
  const day = Math.min(n.daysElapsed + 1, n.daysTotal)
  return { text: H.pace(day, n.daysTotal), day }
}

type Props = { campaign: Campaign; status: EffectiveStatus; numbers: Numbers; imageUrl: string | null; now: Date }

// The campaign that matters most right now: its card, four flight-to-date numbers, pace and actions.
export function CampaignHero({ campaign: c, status, numbers: n, imageUrl, now }: Props) {
  const p = pace(c, n, now)
  const pct = n.daysTotal > 0 ? Math.round((p.day / n.daysTotal) * 100) : 0
  return (
    <section
      className="mb-8 grid overflow-hidden border sm:grid-cols-[220px_minmax(0,1fr)]"
      style={{ borderRadius: tokens.radius, borderColor: tokens.line, backgroundColor: tokens.card }}
    >
      <CampaignThumb brand={c.brand} imageUrl={imageUrl} color={c.tileColor} className="aspect-[16/9] sm:aspect-auto" textClass="text-5xl" />
      <div className="flex min-w-0 flex-col gap-5 p-5 sm:p-6">
        <div className="min-w-0">
          <h2 className="text-[22px] font-semibold leading-tight" style={{ color: tokens.ink }}>
            {c.name}
          </h2>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm" style={{ color: tokens.ink2 }}>
            {c.brand}
            <StatusPill status={status} />
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <NumberTile label={H.tiles.impressions} value={num(n.impressions)} hint={H.tiles.today(num(n.impressionsToday))} />
          <NumberTile label={H.tiles.opens} value={num(n.uniqueLinkOpens)} />
          <NumberTile label={H.tiles.shares} value={num(n.shares)} />
          <NumberTile label={H.tiles.claims} value={num(n.claims)} />
        </div>
        <div>
          <p className="text-sm" style={{ color: tokens.ink2 }}>
            {p.text}
          </p>
          <div
            role="progressbar"
            aria-label={p.text}
            aria-valuenow={p.day}
            aria-valuemin={0}
            aria-valuemax={n.daysTotal}
            className="mt-2 h-1 overflow-hidden rounded-full"
            style={{ backgroundColor: tokens.line2 }}
          >
            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: tokens.ink }} />
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <LinkButton primary href={`/app/campaigns/${c.id}`}>
            {H.open}
          </LinkButton>
          {(status === 'live' || status === 'paused') && <PauseResume id={c.id} status={status} />}
        </div>
      </div>
    </section>
  )
}
