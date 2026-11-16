import type { CardModel } from '@/components/og'
import { ageGated } from '@/lib/campaign-schema'
import { CAMPAIGN_FORM_COPY as F } from '@/lib/copy-campaign-form'
import { HOME } from '@/lib/copy-home'
import { initials } from '@/lib/format'
import { MARKETS } from '@/lib/markets'
import type { FormValues } from './values'

// The New form's draft as Campaigns home shows it (Prompt 6): a Draft card with its headline (else its name), the
// image it has (a video keeps the tile colour, as on the form's preview), where it is kept ("Saved in this browser",
// Prompt 9) and "Carry on" back into the form.
export function draftCard(v: FormValues): CardModel {
  const brand = v.brand.trim()
  return {
    headline: v.headline.trim() || v.name.trim() || HOME.draft.untitled,
    brand: brand || F.previewBox.brand,
    country: MARKETS[v.country].name,
    status: 'draft',
    placement: v.placement,
    ageGated: ageGated(v),
    imageUrl: v.creative?.kind === 'image' ? v.creative.url : null,
    color: v.tileColor,
    initials: initials(brand) || '?',
    mainLeft: HOME.draft.savedHere,
    mainRight: HOME.draft.carryOn,
  }
}
