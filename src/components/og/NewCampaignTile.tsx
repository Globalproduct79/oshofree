import Link from '@/components/og/Link'
import { COMPONENTS } from '@/lib/copy-components'

// The dashed "+ New campaign" tile that ends the home grid.
export function NewCampaignTile({ href = '/app/campaigns/new' }: { href?: string }) {
  return (
    <Link href={href} className="cc new">
      {COMPONENTS.newCampaign}
    </Link>
  )
}
