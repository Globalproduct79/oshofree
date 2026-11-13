import { COMPONENTS, type PlacementKey } from '@/lib/copy-components'
import { coverStyle } from './cover'
import { StatusBadge, type StatusKey } from './StatusBadge'

// Every value is already formatted by the caller (fmt, pct, usd, fd).
export type HeroModel = {
  status: StatusKey
  country: string
  placement: PlacementKey
  // fd(end) and fd(start): the eyebrow says "ends …" when live or paused, "starts …" when
  // scheduled and "awaiting approval" otherwise.
  endsOn: string
  startsOn: string
  headline: string
  brand: string
  name: string
  imageUrl?: string | null
  color: string
  initials: string
  stats: {
    impressions: string
    today: string
    openRate: string
    opened: string
    shareClaims: string
    shared: string
    rewards: string
    left: string
    budget: string
  }
  // Spend ÷ budget × 100, the green pace bar under Budget.
  spendPct: number
  // The grey pace note on the right of the actions.
  note: string
}

const when = (m: HeroModel) =>
  m.status === 'live' || m.status === 'paused'
    ? COMPONENTS.hero.ends(m.endsOn)
    : m.status === 'scheduled'
      ? COMPONENTS.hero.starts(m.startsOn)
      : COMPONENTS.hero.awaiting

const clampPct = (n: number) => (Number.isNaN(n) ? 0 : Math.min(100, Math.max(0, n)))

// The campaign that matters most, at the top of home (ADV §1 item 3): the art panel, then the
// eyebrow, headline, brand · name, four stats, the actions (children) and the pace note.
export function HeroCampaignCard({ model: m, children }: { model: HeroModel; children?: React.ReactNode }) {
  const h = COMPONENTS.hero
  const s = m.stats
  return (
    <div className="hero">
      <div className="art" style={coverStyle(m.imageUrl, m.color)}>
        {!m.imageUrl && <span className="ph">{m.initials}</span>}
      </div>
      <div className="bd">
        <div className="eyebrow">
          <StatusBadge status={m.status} />
          <span>{h.eyebrow(m.country, m.placement, when(m))}</span>
        </div>
        <h2>{m.headline}</h2>
        <p className="brand2">{h.brandLine(m.brand, m.name)}</p>
        <div className="stats">
          <div>
            <small>{h.impressions}</small>
            <b>{s.impressions}</b>
            <em>{h.today(s.today)}</em>
          </div>
          <div>
            <small>{h.openRate}</small>
            <b>{s.openRate}</b>
            <em>{h.opened(s.opened)}</em>
          </div>
          <div>
            <small>{h.shareClaims}</small>
            <b>{s.shareClaims}</b>
            <em>{h.shared(s.shared, s.rewards)}</em>
          </div>
          <div>
            <small>{h.budget}</small>
            <b>{s.left}</b>
            <em>{h.leftOf(s.budget)}</em>
            <div className="pace">
              <span style={{ width: `${clampPct(m.spendPct)}%` }} />
            </div>
          </div>
        </div>
        <div className="acts">
          {children}
          <span className="note">{m.note}</span>
        </div>
      </div>
    </div>
  )
}
