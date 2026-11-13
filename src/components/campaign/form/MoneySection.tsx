'use client'

import { useFormContext, useWatch } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { COPY } from '@/lib/copy'
import { MARKETS } from '@/lib/markets'
import { Field, Section, useField } from './fields'
import type { FormValues } from './values'

const C = COPY.campaignForm

export function MoneySection() {
  const { register, control } = useFormContext<FormValues>()
  const country = useWatch({ control, name: 'country' })
  const symbol = MARKETS[country]?.symbol ?? MARKETS.NG.symbol
  const budget = useField('budgetUsd').a11y
  const starts = useField('startsAt').a11y
  const days = useField('runsForDays').a11y
  const reward = useField('shareRewardLabel').a11y
  return (
    <Section title={C.sections.money} wide>
      <Field name="budgetUsd" label={C.budget.label} hint={C.budget.hint}>
        <Input {...budget} type="number" inputMode="numeric" min={50} step={1} {...register('budgetUsd', { valueAsNumber: true })} />
      </Field>
      <Field name="startsAt" label={C.startsAt.label}>
        <Input {...starts} type="date" {...register('startsAt')} />
      </Field>
      <Field name="runsForDays" label={C.runsForDays.label} hint={C.runsForDays.hint}>
        <Input {...days} type="number" inputMode="numeric" min={1} max={90} step={1} {...register('runsForDays', { valueAsNumber: true })} />
      </Field>
      <Field name="shareRewardLabel" label={C.shareReward.label} hint={C.shareReward.hint} full>
        <Input {...reward} maxLength={60} placeholder={C.shareReward.placeholder(symbol)} {...register('shareRewardLabel')} />
      </Field>
    </Section>
  )
}
