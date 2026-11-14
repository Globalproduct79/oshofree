'use client'

import type { RefObject } from 'react'
import { Swatches } from '@/components/og'
import { CAMPAIGN_FORM_COPY as F } from '@/lib/copy-campaign-form'
import { CATEGORIES, COUNTRIES, MARKETS, type Category, type Country } from '@/lib/markets'
import { tokens } from '@/lib/tokens'
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
}

// ADV §3 fields 1–7: name, brand, country, category, tile colour, headline, description.
export function OfferFields({ values: v, update, agency, locked, brandRef }: Props) {
  return (
    <>
      <label className="f full">
        {L.name.label} <small>{locked ? F.locked.running : L.name.hint}</small>
        <input
          value={v.name}
          disabled={locked}
          placeholder={L.name.placeholder}
          maxLength={80}
          onChange={(e) => update({ name: e.target.value })}
        />
      </label>
      <label className="f">
        {L.brand.label}
        {agency && <> <small>{L.brand.hint}</small></>}
        <input ref={brandRef} value={v.brand} readOnly={!agency} maxLength={80} onChange={(e) => update({ brand: e.target.value })} />
      </label>
      <label className="f">
        {L.country.label}
        {locked && <> <small>{F.locked.running}</small></>}
        <select value={v.country} disabled={locked} onChange={(e) => update({ country: e.target.value as Country })}>
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>{MARKETS[c].name}</option>
          ))}
        </select>
      </label>
      <label className="f">
        {L.category.label}
        <select value={v.category} onChange={(e) => update({ category: e.target.value as Category })}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>
      <div>
        {/* Not wrapped round the swatches: a label's click would press the first one. */}
        <label className="f" id="cf-colour">
          {L.tileColor.label} <small>{L.tileColor.hint}</small>
        </label>
        <div role="group" aria-labelledby="cf-colour">
          <Swatches colors={tokens.tileColors} value={v.tileColor} onChange={(c) => update({ tileColor: c })} />
        </div>
      </div>
      <label className="f full">
        {L.headline.label} <small>{L.headline.counter(v.headline.trim().length)}</small>
        <input
          value={v.headline}
          maxLength={48}
          placeholder={L.headline.placeholder}
          onChange={(e) => update({ headline: e.target.value })}
        />
      </label>
      <label className="f full">
        {L.description.label} <small>{L.description.hint}</small>
        <textarea
          value={v.description}
          maxLength={240}
          placeholder={L.description.placeholder}
          onChange={(e) => update({ description: e.target.value })}
        />
      </label>
    </>
  )
}
