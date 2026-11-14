import { Box, KVGrid, LinkButton } from '@/components/og'
import type { CampaignReport } from '@/lib/campaign-report'
import { CAMPAIGN_COPY } from '@/lib/copy-report'

const O = CAMPAIGN_COPY.offer

// The creative as it runs: the image, or the video with its controls, opened at its first frame (#t=0.1 makes
// Safari draw it). The same file the Phoenix preview and Global's review show.
function Creative({ creative }: { creative: NonNullable<CampaignReport['offer']['creative']> }) {
  if (creative.kind === 'video') {
    return <video src={`${creative.url}#t=0.1`} aria-label={O.creative.video} controls playsInline preload="metadata" className="cr" />
  }
  // An uploaded creative served by /uploads; next/image adds nothing here.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={creative.url} alt={O.creative.image} className="cr" />
}

// "The offer" (ADV §2): the creative it runs (ours), the live version's headline, redeem, category and placement at
// its CPM, the description, and the way into Edit offer for those who may change it.
export function OfferBox({ offer, editHref }: { offer: CampaignReport['offer']; editHref: string | null }) {
  return (
    <Box title={O.title} sub={O.sub}>
      {offer.creative && <Creative creative={offer.creative} />}
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
