import { CampaignCard } from '@/components/og'
import { ageGated } from '@/lib/campaign-schema'
import { CAMPAIGN_FORM_COPY as F } from '@/lib/copy-campaign-form'
import { initials } from '@/lib/format'
import { MARKETS } from '@/lib/markets'
import { flightLength, type FormValues } from './values'

const P = F.previewBox

// ADV §3 "Card preview box": the card built from the form, static. The cover is the attached image or
// the tile colour with the brand's initials ("?" with no brand); a video creative keeps the colour.
export function CardPreview({ values: v }: { values: FormValues }) {
  const brand = v.brand.trim()
  return (
    <CampaignCard
      campaign={{
        headline: v.headline.trim() || P.headline,
        brand: brand || P.brand,
        country: MARKETS[v.country].name,
        status: null,
        placement: v.placement,
        placementLabel: F.placements[v.placement].pill,
        ageGated: ageGated(v),
        imageUrl: v.creative?.kind === 'image' ? v.creative.url : null,
        color: v.tileColor,
        initials: initials(brand) || '?',
        flightDays: flightLength(v) ?? undefined,
        mainLeft: '',
        mainRight: v.redeemMethod === 'code' ? P.code : P.link,
      }}
    />
  )
}
