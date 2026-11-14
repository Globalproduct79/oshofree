import Link from 'next/link'
import { COMPONENTS, type PlacementKey } from '@/lib/copy-components'
import { coverStyle } from './cover'
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
}

const clampPct = (n: number) => (Number.isNaN(n) ? 0 : Math.min(100, Math.max(0, n)))

// The campaign card (ADV §1 "CampaignCard anatomy"): a 118 px cover with the status pill, 18+ and
// placement overlays, then headline, brand · country, the main row and the spend bar. With an
// href the whole card is a link; without one it is static (`data-static`, the form preview). A client
// caller may take over the click (Review's "Live now" enters the campaign's workspace first).
export function CampaignCard({
  campaign: c,
  href,
  onClick,
}: {
  campaign: CardModel
  href?: string
  onClick?: React.MouseEventHandler<HTMLAnchorElement>
}) {
  const body = (
    <>
      <div className="cv" style={coverStyle(c.imageUrl, c.color)}>
        {!c.imageUrl && <span className="ph">{c.initials}</span>}
        {c.status && <StatusBadge status={c.status} />}
        {c.ageGated && <span className="age">{COMPONENTS.card.age}</span>}
        <span className="plb">{c.placementLabel ?? COMPONENTS.card.placement(c.placement)}</span>
      </div>
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
  return href ? (
    <Link href={href} className="cc" onClick={onClick}>
      {body}
    </Link>
  ) : (
    <div className="cc" data-static="" style={{ cursor: 'default' }}>
      {body}
    </div>
  )
}
