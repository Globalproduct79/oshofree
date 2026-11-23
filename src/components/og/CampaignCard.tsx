import Link from '@/components/og/Link'
import { COMPONENTS, type PlacementKey } from '@/lib/copy-components'
import { CreativeMedia } from './CreativeMedia'
import { DemoPill } from './DemoPill'
import { StatusBadge, type StatusKey } from './StatusBadge'

export type CardModel = {
  headline: string
  brand: string
  // The country's name ("Nigeria").
  country: string
  // null leaves the pill off (the form's card preview).
  status: StatusKey | null
  placement: PlacementKey
  // The pill's own text when it differs from the placement's ("Splash ▶" on the form preview).
  placementLabel?: string
  ageGated: boolean
  imageUrl?: string | null
  // A video creative: the cover shows its first frame over the tile colour.
  videoUrl?: string | null
  color: string
  initials: string
  // Adds " · {n}d left" to the sub-line (live and paused campaigns).
  daysLeft?: number
  // Adds " · {n}d" instead: the flight's length, on the form preview.
  flightDays?: number
  // The main row: bold left value (an empty string leaves it out) and the small right value.
  mainLeft: string
  mainRight?: string
  // The orange spend bar (live, paused and ended campaigns), as spend ÷ budget × 100.
  spendPct?: number
  // A line under the sub-line naming who created the campaign (Platform › Advertisers › workspace).
  createdBy?: string
  // Its workspace is the seed's (Prompt 9): the Demo pill on the cover's free corner (Review's "Live now").
  demo?: boolean
}

const clampPct = (n: number) => (Number.isNaN(n) ? 0 : Math.min(100, Math.max(0, n)))

// The campaign card (ADV §1 "CampaignCard anatomy"): a 118 px cover (the image, a video's first frame, or the tile
// colour with the initials) with the status pill, 18+ and placement overlays, then headline, brand · country, the main row and the spend bar. With an
// href the whole card is a link; without one it is static (`data-static`, the form preview). A client
// caller may take over the click (Review's "Live now" enters the campaign's workspace first).
export function CampaignCard({
  campaign: c,
  href,
  onClick,
  busy,
}: {
  campaign: CardModel
  href?: string
  onClick?: React.MouseEventHandler<HTMLAnchorElement>
  // A click the caller took over is on its way (Review's Live now entering a workspace): dimmed, progress cursor.
  busy?: boolean
}) {
  const body = (
    <>
      <CreativeMedia
        image={c.imageUrl}
        video={c.videoUrl}
        labels={COMPONENTS.creative}
        color={c.color}
        className="cv"
        fallback={<span className="ph">{c.initials}</span>}
      >
        {c.status && <StatusBadge status={c.status} />}
        {c.ageGated && <span className="age">{COMPONENTS.card.age}</span>}
        <span className="plb">{c.placementLabel ?? COMPONENTS.card.placement(c.placement)}</span>
      </CreativeMedia>
      <div className="bd">
        <div className="t">{c.headline}</div>
        <div className="b">
          {c.flightDays === undefined
            ? COMPONENTS.card.sub(c.brand, c.country, c.daysLeft)
            : COMPONENTS.card.subFlight(c.brand, c.country, c.flightDays)}
          {c.createdBy && <span className="by">{COMPONENTS.card.createdBy(c.createdBy)}</span>}
        </div>
        <div className="row">
          {c.mainLeft && <b>{c.mainLeft}</b>}
          <span>{c.mainRight}</span>
        </div>
        {c.spendPct !== undefined && (
          <div className="bar">
            <i style={{ width: `${clampPct(c.spendPct)}%` }} />
          </div>
        )}
      </div>
    </>
  )
  const card = href ? (
    <Link href={href} className="cc" onClick={onClick} aria-busy={busy || undefined}>
      {body}
    </Link>
  ) : (
    <div className="cc" data-static="" style={{ cursor: 'default' }}>
      {body}
    </div>
  )
  // A demo workspace's card: the pill sits on the cover but after the link, not in it, so the link keeps its own name.
  return c.demo ? (
    <div className="ccw">
      {card} <DemoPill />
    </div>
  ) : (
    card
  )
}
