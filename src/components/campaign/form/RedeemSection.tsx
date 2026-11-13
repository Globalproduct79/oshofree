'use client'

import { useFormContext, useWatch } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { COPY } from '@/lib/copy'
import { tokens } from '@/lib/tokens'
import { Field, Section, useField } from './fields'
import { blankToUndefined, type FormValues } from './values'

const C = COPY.campaignForm
const METHODS = ['code', 'link'] as const

export function RedeemSection() {
  const { register, control } = useFormContext<FormValues>()
  const method = useWatch({ control, name: 'redeemMethod' })
  const claimCode = useField('claimCode').a11y
  const linkUrl = useField('linkUrl').a11y
  // The hidden field leaves the form, so a link offer never carries a stale claim code.
  const opts = { setValueAs: blankToUndefined, shouldUnregister: true }
  return (
    <Section title={C.sections.redeem}>
      <fieldset className="grid grid-cols-2 gap-3 sm:col-span-full">
        <legend className="sr-only">{C.sections.redeem}</legend>
        {METHODS.map((m) => (
          <label
            key={m}
            className="flex cursor-pointer flex-col gap-1 rounded-xl border p-3 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
            style={{
              borderColor: method === m ? tokens.accent : tokens.line,
              backgroundColor: method === m ? tokens.accentSoft : tokens.card,
            }}
          >
            <input type="radio" value={m} className="sr-only" {...register('redeemMethod')} />
            <span className="text-sm font-semibold" style={{ color: tokens.ink }}>{C.redeem[m].label}</span>
            <span className="text-xs" style={{ color: tokens.ink2 }}>{C.redeem[m].detail}</span>
          </label>
        ))}
      </fieldset>
      {method === 'link' ? (
        <Field name="linkUrl" label={C.redeem.linkUrl.label} hint={C.redeem.linkUrl.hint} full>
          <Input {...linkUrl} type="url" inputMode="url" placeholder={C.redeem.linkUrl.placeholder} {...register('linkUrl', opts)} />
        </Field>
      ) : (
        <Field name="claimCode" label={C.redeem.claimCode.label} hint={C.redeem.claimCode.hint} full>
          <Input {...claimCode} maxLength={24} placeholder={C.redeem.claimCode.placeholder} {...register('claimCode', opts)} />
        </Field>
      )}
    </Section>
  )
}
