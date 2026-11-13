'use client'

import { useFormContext, useWatch } from 'react-hook-form'
import { COPY } from '@/lib/copy'
import { MARKETS } from '@/lib/markets'
import { tokens } from '@/lib/tokens'
import { Message, Section, useField } from './fields'
import type { FormValues } from './values'

const C = COPY.campaignForm

export function ConfirmSection() {
  const { register, control } = useFormContext<FormValues>()
  const country = useWatch({ control, name: 'country' })
  const { a11y, error, id } = useField('termsAccepted')
  return (
    <Section title={C.sections.confirm}>
      <div className="flex flex-col gap-1.5 sm:col-span-full">
        <label className="flex cursor-pointer items-start gap-2.5 text-sm" style={{ color: tokens.ink }}>
          <input
            {...a11y}
            type="checkbox"
            className="mt-0.5 size-4 shrink-0"
            style={{ accentColor: tokens.ink }}
            {...register('termsAccepted')}
          />
          {C.terms(MARKETS[country]?.name ?? '')}
        </label>
        <Message id={`${id}-msg`} error={error} />
      </div>
    </Section>
  )
}
