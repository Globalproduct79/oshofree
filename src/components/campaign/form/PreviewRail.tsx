'use client'

import { previewOffers } from '@/app/app/(console)/campaigns/actions'
import { OfferCard } from '@/components/campaign/OfferCard'
import { PreviewButton } from '@/components/campaign/PreviewButton'
import { COPY } from '@/lib/copy'
import { tokens } from '@/lib/tokens'
import { previewEndsAt, type FormDefaults } from './values'

const P = COPY.campaignForm.preview

type Props = { values: FormDefaults; imageUrl: string | null; campaignId?: string }

// The card exactly as the wall will show it, redrawn on every keystroke, and the same card on Phoenix.
export function PreviewRail({ values, imageUrl, campaignId }: Props) {
  const card = {
    brand: values.brand?.trim() || P.brand,
    headline: values.headline?.trim() || P.headline,
    description: values.description?.trim() ?? '',
    imageUrl,
    color: values.tileColor,
    rewardLabel: values.shareRewardLabel?.trim() || P.reward,
    endsAt: previewEndsAt(values.startsAt, values.runsForDays, values.country),
  }
  return (
    <aside className="lg:sticky lg:top-6">
      <section
        className="border p-5"
        style={{ borderRadius: tokens.radius, borderColor: tokens.line, backgroundColor: tokens.card }}
      >
        <h2 className="text-base font-semibold" style={{ color: tokens.ink }}>{P.title}</h2>
        <p className="mt-1 text-sm" style={{ color: tokens.ink2 }}>{P.subtitle}</p>
        <div className="mt-4">
          <OfferCard offer={card} />
        </div>
        <PreviewButton
          className="mt-4 w-full"
          mine={{ ...card, id: campaignId, category: values.category }}
          load={() => previewOffers(values.country)}
        />
      </section>
    </aside>
  )
}
