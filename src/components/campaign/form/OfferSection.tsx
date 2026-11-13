'use client'

import { useFormContext } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { COPY } from '@/lib/copy'
import { CATEGORIES, COUNTRIES, MARKETS } from '@/lib/markets'
import { Field, Section, selectClass, useField } from './fields'
import type { FormValues } from './values'

const C = COPY.campaignForm

export function OfferSection() {
  const { register } = useFormContext<FormValues>()
  const name = useField('name').a11y
  const brand = useField('brand').a11y
  const country = useField('country').a11y
  const category = useField('category').a11y
  return (
    <Section title={C.sections.offer}>
      <Field name="name" label={C.name.label} hint={C.name.hint} full>
        <Input {...name} maxLength={80} autoComplete="off" {...register('name')} />
      </Field>
      <Field name="brand" label={C.brand.label} hint={C.brand.hint} full>
        <Input {...brand} maxLength={80} {...register('brand')} />
      </Field>
      <Field name="country" label={C.country.label} hint={C.country.hint}>
        <select {...country} className={selectClass} {...register('country')}>
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {MARKETS[c].name}
            </option>
          ))}
        </select>
      </Field>
      <Field name="category" label={C.category.label}>
        <select {...category} className={selectClass} {...register('category')}>
          <option value="">{C.category.choose}</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>
    </Section>
  )
}
