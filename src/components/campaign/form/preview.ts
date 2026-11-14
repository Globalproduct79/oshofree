import { ageGated, rewardLabel } from '@/lib/campaign-schema'
import { CAMPAIGN_FORM_COPY as F } from '@/lib/copy-campaign-form'
import type { PreviewCampaign } from '@/lib/preview-merge'
import { amount, previewEndsAt, type FormValues } from './values'

// The form as the preview draws it (Prompt 7): the values as they will be stored (trimmed, the reward's label as the
// wall prints it, the flight's end). A new campaign has no id yet ('__draft'), so it cannot match a live offer. Until a
// brand is typed the card says "Brand", as the Card preview does; the Review step only opens once every field is set.
export function formPreview(v: FormValues, id: string, sampleLink: string, now = new Date()): PreviewCampaign {
  return {
    id,
    brand: v.brand.trim() || F.previewBox.brand,
    headline: v.headline.trim(),
    category: v.category,
    placement: v.placement,
    ageGated: ageGated(v),
    creative: {
      image: v.creative?.kind === 'image' ? v.creative.url : null,
      video: v.creative?.kind === 'video' ? v.creative.url : null,
      color: v.tileColor,
    },
    description: v.description.trim(),
    rewardLabel: rewardLabel(v.country, amount(v.rewardLocal)),
    redeemMethod: v.redeemMethod,
    endsAt: previewEndsAt(v, now).toISOString(),
    country: v.country,
    sampleLink,
  }
}
