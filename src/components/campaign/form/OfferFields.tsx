'use client'

import type { RefObject } from 'react'
import { Swatches } from '@/components/og'
import { BRAND_MAX, DESCRIPTION_MAX, HEADLINE_MAX, NAME_MAX } from '@/lib/campaign-schema'
import { CAMPAIGN_FORM_COPY as F } from '@/lib/copy-campaign-form'
import { CATEGORIES, COUNTRIES, MARKETS, type Category, type Country } from '@/lib/markets'
import { tokens } from '@/lib/tokens'
import { FieldError, fieldProps, groupProps, type Marked } from './field'
import type { FormValues } from './values'

const L = F.fields

type Props = {
  values: FormValues
  update: (patch: Partial<FormValues>) => void
  // An agency names its client; a brand's campaigns carry the workspace's name, read-only.
  agency: boolean
  // A running campaign's revision keeps its name and market (spec §6.14.3).
  locked: boolean
  brandRef: RefObject<HTMLInputElement | null>
  // The refused field, marked with its sentence.
  marked?: Marked
}

// ADV §3 fields 1–7: name, brand, country, category, tile colour, headline, description.
export function OfferFields({ values: v, update, agency, locked, brandRef, marked = null }: Props) {
  return (
    <>
      <label className="f full">
        {L.name.label} <small>{locked ? F.locked.running : L.name.hint}</small>
        <input
          {...fieldProps('name', marked)}
          value={v.name}
          disabled={locked}
          placeholder={L.name.placeholder}
          maxLength={NAME_MAX}
          onChange={(e) => update({ name: e.target.value })}
        />
        <FieldError field="name" marked={marked} />
      </label>
      <label className="f">
        {L.brand.label}
        {agency && <> <small>{L.brand.hint}</small></>}
        <input
          {...fieldProps('brand', marked)}
          ref={brandRef}
          value={v.brand}
          readOnly={!agency}
          maxLength={BRAND_MAX}
          onChange={(e) => update({ brand: e.target.value })}
        />
        <FieldError field="brand" marked={marked} />
      </label>
      <label className="f">
        {L.country.label}
        {locked && <> <small>{F.locked.running}</small></>}
        <select {...fieldProps('country', marked)} value={v.country} disabled={locked} onChange={(e) => update({ country: e.target.value as Country })}>
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>{MARKETS[c].name}</option>
          ))}
        </select>
        <FieldError field="country" marked={marked} />
      </label>
      <label className="f">
        {L.category.label}
        <select {...fieldProps('category', marked)} value={v.category} onChange={(e) => update({ category: e.target.value as Category })}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <FieldError field="category" marked={marked} />
      </label>
      <div>
        {/* Not wrapped round the swatches: a label's click would press the first one. */}
        <label className="f" id="cf-colour">
          {L.tileColor.label} <small>{L.tileColor.hint}</small>
        </label>
        <div role="group" aria-labelledby="cf-colour" {...groupProps('tileColor')}>
          <Swatches colors={tokens.tileColors} value={v.tileColor} onChange={(c) => update({ tileColor: c })} />
        </div>
        <FieldError field="tileColor" marked={marked} spoken />
      </div>
      <label className="f full">
        {L.headline.label} <small>{L.headline.counter(v.headline.trim().length, HEADLINE_MAX)}</small>
        <input
          {...fieldProps('headline', marked)}
          value={v.headline}
          maxLength={HEADLINE_MAX}
          placeholder={L.headline.placeholder}
          onChange={(e) => update({ headline: e.target.value })}
        />
        <FieldError field="headline" marked={marked} />
      </label>
      <label className="f full">
        {L.description.label} <small>{L.description.hint}</small>
        <textarea
          {...fieldProps('description', marked)}
          value={v.description}
          maxLength={DESCRIPTION_MAX}
          placeholder={L.description.placeholder}
          onChange={(e) => update({ description: e.target.value })}
        />
        <FieldError field="description" marked={marked} />
      </label>
    </>
  )
}
