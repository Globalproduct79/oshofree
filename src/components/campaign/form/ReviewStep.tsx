'use client'

import type { ReactNode, RefObject } from 'react'
import { PhoneThumb } from '@/components/campaign/PhoneFrame'
import { CreativeMedia, KVGrid } from '@/components/og'
import { ageGated, campaignDates, hasLicence, isBettingOrDraw, type CampaignField, type CreditPosition } from '@/lib/campaign-schema'
import { CAMPAIGN_FORM_COPY as F } from '@/lib/copy-campaign-form'
import { fd, loc, localAmount, usd } from '@/lib/format'
import { MARKETS } from '@/lib/markets'
import type { PreviewOffer } from '@/lib/preview-merge'
import { CostBox } from './CostBox'
import { fieldProps, HINT_ID, type Marked } from './field'
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
  // Back to the edit step with the cursor on that field (a brand workspace's brand is its own, so it has no Edit).
  onEdit: (field: CampaignField) => void
  agency: boolean
  // The confirmation, once Submit was pressed without it.
  marked?: Marked
  // The heading takes the focus when the step opens.
  headingRef?: RefObject<HTMLHeadingElement | null>
  // The form's buttons, last.
  children?: ReactNode
}

// The creative as it will run: the image, the video with its controls (opened at its first frame), a splash on a
// phone, or a line saying the card shows the tile colour, with its Edit (the one place that fact is said).
function Creative({ values: v, mine, edit }: Pick<Props, 'values' | 'mine'> & { edit: ReactNode }) {
  const c = v.creative
  if (c && v.placement === 'splash') return <PhoneThumb mine={mine} country={MARKETS[v.country].name} label={F.drop.splashFrame} />
  return (
    <CreativeMedia
      image={c?.kind === 'image' ? c.url : null}
      video={c?.kind === 'video' ? c.url : null}
      labels={R}
      controls
      className="cr"
      fallback={
        <p className="desc">
          {R.noCreative} {edit}
        </p>
      }
    />
  )
}

// The flight as the campaign page prints it: the start, the (exclusive) end, both at the market's midnight.
function flight(v: FormValues): string {
  const days = flightLength(v) ?? 0
  const tz = MARKETS[v.country].timezone
  const { startsAt, endsAt } = campaignDates(v.startsAt, days, v.country, v.runsFor === 'custom' ? v.endsAt : undefined)
  return R.flightValue(fd(startsAt, tz), fd(endsAt, tz), days)
}

// The New form's Review step (Prompt 6): everything the campaign will be, read-only and in the form's order (the
// offer, its creative, where and when it runs, the money with the Cost box's estimate), each value with an Edit back to
// its field, then the confirmation the rules ask for before "Submit for review". It opens only once every other rule
// passes, so every value is usable.
export function ReviewStep({ values: v, cpmCents, fxPerUsd, credit, mine, update, onEdit, agency, marked = null, headingRef, children }: Props) {
  const placement = F.placements[v.placement].name
  const budgetCents = amount(v.budgetUsd) * 100
  // A value's Edit, which names the field for a screen reader; and a value's label with its Edit.
  const edit = (text: string, field: CampaignField) => (
    <button type="button" className="linkbtn" aria-label={R.editLabel(text)} onClick={() => onEdit(field)}>
      {R.edit}
    </button>
  )
  const label = (text: string, field?: CampaignField) =>
    field ? (
      <>
        {text}
        {edit(text, field)}
      </>
    ) : (
      text
    )
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
              { label: label(L.name.label, 'name'), value: v.name.trim() },
              { label: label(L.brand.label, agency ? 'brand' : undefined), value: v.brand.trim() },
              { label: label(L.category.label, 'category'), value: v.category },
              { label: label(L.headline.label, 'headline'), value: v.headline.trim() },
              { label: label(L.description.label, 'description'), value: v.description.trim(), wide: true },
              { label: label(L.redeem.label, 'redeemMethod'), value: L.redeem.options[v.redeemMethod] },
              ...(v.redeemMethod === 'link' ? [{ label: label(L.link.label, 'linkUrl'), value: v.linkUrl.trim() }] : []),
            ]}
          />
        </section>
        <section>
          <b className="subt">{R.creative}</b>
          <Creative values={v} mine={mine} edit={edit(F.drop[v.placement].label, 'creative')} />
          <KVGrid
            items={[
              ...(v.creative
                ? [{ label: label(F.drop[v.placement].label, 'creative'), value: v.creative.kind === 'image' ? R.image : R.video }]
                : []),
              {
                label: label(L.tileColor.label, 'tileColor'),
                value: (
                  <>
                    <span className="tc" style={{ background: v.tileColor }} aria-hidden="true" />
                    {v.tileColor}
                  </>
                ),
              },
            ]}
          />
        </section>
        <section>
          <b className="subt">{R.targeting}</b>
          <KVGrid
            items={[
              { label: label(L.country.label, 'country'), value: MARKETS[v.country].name },
              {
                label: label(L.placement.label, 'placement'),
                value: cpmCents === null ? placement : R.placementAt(placement, F.placements.cpm((cpmCents / 100).toFixed(2))),
              },
              { label: R.age, value: ageGated(v) ? R.ageGated : R.open },
              ...(isBettingOrDraw(v) && hasLicence(v.description) ? [{ label: R.licence, value: R.licenceFound }] : []),
              { label: label(R.flight, 'startsAt'), value: flight(v) },
            ]}
          />
        </section>
        <section>
          <b className="subt">{R.money}</b>
          <KVGrid
            items={[
              {
                label: label(L.budget.label, 'budgetUsd'),
                value: fxPerUsd === null ? usd(budgetCents) : `${usd(budgetCents)} · ${loc(budgetCents, v.country, fxPerUsd)}`,
              },
              { label: label(L.reward.label, 'rewardLocal'), value: R.reward(localAmount(amount(v.rewardLocal), v.country)) },
            ]}
          />
          <CostBox values={v} cpmCents={cpmCents} fxPerUsd={fxPerUsd} credit={credit} />
        </section>
        {/* Its sentence is the hint beside Submit, just below. */}
        <label className="chk">
          <input
            {...fieldProps('termsAccepted', marked, HINT_ID)}
            type="checkbox"
            checked={v.termsAccepted}
            onChange={(e) => update({ termsAccepted: e.target.checked })}
          />{' '}
          {L.terms}
        </label>
        {children}
      </div>
    </>
  )
}
