import { Box, KVGrid, LinkButton } from '@/components/og'
import type { CampaignReport } from '@/lib/campaign-report'
import { CAMPAIGN_COPY } from '@/lib/copy-report'

const O = CAMPAIGN_COPY.offer

// "The offer" (ADV §2): the live version's headline, redeem, category and placement at its CPM, the
// description, and the way into Edit offer for those who may change it.
export function OfferBox({ offer, editHref }: { offer: CampaignReport['offer']; editHref: string | null }) {
  return (
    <Box title={O.title} sub={O.sub}>
      <KVGrid items={offer.items} />
      <p className="desc">{offer.description}</p>
      {editHref && (
        <LinkButton variant="ghost" href={editHref}>
          {O.edit}
        </LinkButton>
      )}
    </Box>
  )
}
