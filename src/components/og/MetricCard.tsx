import Link from '@/components/og/Link'
import { COMPONENTS } from '@/lib/copy-components'

// The line under the value is a percentage; anything outside 0–100 is pinned to the ends.
const lineWidth = (fill: number | undefined) =>
  fill === undefined ? 100 : Number.isNaN(fill) ? 0 : Math.min(100, Math.max(0, fill))

// The KPI tile (prototype `metric()`): title with a green dot, big value, thin orange line at
// `fill`%, grey sub-line and an optional "Open ›" link.
export function MetricCard({
  title,
  value,
  sub,
  fill,
  openHref,
}: {
  title: React.ReactNode
  value: React.ReactNode
  sub: React.ReactNode
  fill?: number
  openHref?: string
}) {
  return (
    <div className="mc">
      <div className="t">
        {title}
        <i />
      </div>
      <div className="v">{value}</div>
      <div className="ln">
        <i style={{ width: `${lineWidth(fill)}%` }} />
      </div>
      <div className="f">
        <span>{sub}</span>
        {openHref && <Link href={openHref}>{COMPONENTS.metric.open}</Link>}
      </div>
    </div>
  )
}
