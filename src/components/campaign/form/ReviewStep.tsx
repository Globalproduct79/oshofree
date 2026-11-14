'use client'

import type { ReactNode, RefObject } from 'react'
import { PhoneThumb } from '@/components/campaign/PhoneFrame'
import { KVGrid } from '@/components/og'
import { ageGated, campaignDates, hasLicence, isBettingOrDraw, type CreditPosition } from '@/lib/campaign-schema'
import { CAMPAIGN_FORM_COPY as F } from '@/lib/copy-campaign-form'
import { fd, loc, localAmount, usd } from '@/lib/format'
import { MARKETS } from '@/lib/markets'
import type { PreviewOffer } from '@/lib/preview-merge'
import { CostBox } from './CostBox'
import { amount, flightLength, type FormValues } from './values'

const L = F.fields
const R = F.review

type Props = {
  values: FormValues
  // Phoenix's current CPM for the chosen placement and country, and the country's FX; null when unset.
  cpmCents: number | null
  fxPerUsd: number | null
  credit: CreditPosition
  // The draft as Phoenix draws it: a splash shows on a phone.
  mine: PreviewOffer
  // The confirmation is the one thing given here.
  update: (patch: Partial<FormValues>) => void
  // The heading takes the focus when the step opens.
  headingRef?: RefObject<HTMLHeadingElement | null>
  // The form's buttons, last.
  children?: ReactNode
}

// The creative as it will run: the image, the video with its controls (opened at its first frame), a splash on a
// phone, or a line saying the card shows the tile colour.
function Creative({ values: v, mine }: Pick<Props, 'values' | 'mine'>) {
  const c = v.creative
  if (!c) return <p className="desc">{R.noCreative}</p>
  if (v.placement === 'splash') return <PhoneThumb mine={mine} country={MARKETS[v.country].name} label={F.drop.splashFrame} />
  if (c.kind === 'video') {
    return <video src={`${c.url}#t=0.1`} aria-label={R.video} controls playsInline preload="metadata" className="cr" />
  }
  // An uploaded creative served by /uploads; next/image adds nothing here.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={c.url} alt={R.image} className="cr" />
}

// The flight as the campaign page prints it: the start, the (exclusive) end, both at the market's midnight.
function flight(v: FormValues): string {
  const days = flightLength(v) ?? 0
  const tz = MARKETS[v.country].timezone
  const { startsAt, endsAt } = campaignDates(v.startsAt, days, v.country, v.runsFor === 'custom' ? v.endsAt : undefined)
  return R.flightValue(fd(startsAt, tz), fd(endsAt, tz), days)
}

// The New form's Review step (Prompt 6): everything the campaign will be, read-only and in the form's order (the
// offer, its creative, where and when it runs, the money with the Cost box's estimate), then the confirmation the
// rules ask for before "Submit for review". It opens only once every other rule passes, so every value is usable.
export function ReviewStep({ values: v, cpmCents, fxPerUsd, credit, mine, update, headingRef, children }: Props) {
  const placement = F.placements[v.placement].name
  const budgetCents = amount(v.budgetUsd) * 100
  return (
    <>
      <h3 ref={headingRef} tabIndex={-1}>
        {R.title}
      </h3>
      <p className="sub">{R.sub}</p>
      <div className="summary">
        <section>
          <b className="subt">{R.offer}</b>
          <KVGrid
            items={[
              { label: L.name.label, value: v.name.trim() },
              { label: L.brand.label, value: v.brand.trim() },
              { label: L.category.label, value: v.category },
              { label: L.headline.label, value: v.headline.trim() },
              { label: L.redeem.label, value: L.redeem.options[v.redeemMethod] },
              ...(v.redeemMethod === 'link' ? [{ label: L.link.label, value: v.linkUrl.trim() }] : []),
            ]}
          />
          <p className="desc">{v.description.trim()}</p>
        </section>
        <section>
          <b className="subt">{R.creative}</b>
          <Creative values={v} mine={mine} />
        </section>
        <section>
          <b className="subt">{R.targeting}</b>
          <KVGrid
            items={[
              { label: L.country.label, value: MARKETS[v.country].name },
              {
                label: L.placement.label,
                value: cpmCents === null ? placement : R.placementAt(placement, F.placements.cpm((cpmCents / 100).toFixed(2))),
              },
              { label: R.age, value: ageGated(v) ? R.ageGated : R.open },
              ...(isBettingOrDraw(v) && hasLicence(v.description) ? [{ label: R.licence, value: R.licenceFound }] : []),
              { label: R.flight, value: flight(v) },
            ]}
          />
        </section>
        <section>
          <b className="subt">{R.money}</b>
          <KVGrid
            items={[
              {
                label: L.budget.label,
                value: fxPerUsd === null ? usd(budgetCents) : `${usd(budgetCents)} · ${loc(budgetCents, v.country, fxPerUsd)}`,
              },
              { label: L.reward.label, value: R.reward(localAmount(amount(v.rewardLocal), v.country)) },
            ]}
          />
          <CostBox values={v} cpmCents={cpmCents} fxPerUsd={fxPerUsd} credit={credit} />
        </section>
        <label className="chk">
          <input type="checkbox" checked={v.termsAccepted} onChange={(e) => update({ termsAccepted: e.target.checked })} />{' '}
          {L.terms}
        </label>
        {children}
      </div>
    </>
  )
}
