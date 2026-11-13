'use client'

import { OfferCard } from '@/components/campaign/OfferCard'
import { Button } from '@/components/ui/button'
import { COPY } from '@/lib/copy'
import { tokens } from '@/lib/tokens'
import { previewEndsAt, type FormDefaults } from './values'

const P = COPY.campaignForm.preview

// The card exactly as the wall will show it, redrawn on every keystroke.
export function PreviewRail({ values, imageUrl }: { values: FormDefaults; imageUrl: string | null }) {
  return (
    <aside className="lg:sticky lg:top-6">
      <section
        className="border p-5"
        style={{ borderRadius: tokens.radius, borderColor: tokens.line, backgroundColor: tokens.card }}
      >
        <h2 className="text-base font-semibold" style={{ color: tokens.ink }}>{P.title}</h2>
        <p className="mt-1 text-sm" style={{ color: tokens.ink2 }}>{P.subtitle}</p>
        <div className="mt-4">
          <OfferCard
            offer={{
              brand: values.brand?.trim() || P.brand,
              headline: values.headline?.trim() || P.headline,
              description: values.description?.trim() ?? '',
              imageUrl,
              color: values.tileColor,
              rewardLabel: values.shareRewardLabel?.trim() || P.reward,
              endsAt: previewEndsAt(values.startsAt, values.runsForDays),
            }}
          />
        </div>
        {/* Task 13 wires this to the phone-frame preview. The span carries the tooltip a disabled button can't. */}
        <span title={P.phoenixSoon} className="mt-4 block">
          <Button type="button" variant="outline" size="lg" className="w-full" disabled title={P.phoenixSoon}>
            {P.phoenix}
          </Button>
        </span>
      </section>
    </aside>
  )
}
