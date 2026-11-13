'use client'

import { useFormContext, useWatch } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { COPY } from '@/lib/copy'
import { CreativePicker } from './CreativePicker'
import { Field, Section, useField } from './fields'
import type { FormValues } from './values'

const C = COPY.campaignForm

export function ConsumerSection({ imageUrl, onImage }: { imageUrl: string | null; onImage: (url: string | null) => void }) {
  const { register, control } = useFormContext<FormValues>()
  const [headline = '', description = ''] = useWatch({ control, name: ['headline', 'description'] })
  const headlineA11y = useField('headline').a11y
  const descriptionA11y = useField('description').a11y
  return (
    <Section title={C.sections.consumer}>
      <Field name="headline" label={C.headline.label} counter={`${headline.length}/48`} full>
        <Input {...headlineA11y} maxLength={48} placeholder={C.headline.placeholder} {...register('headline')} />
      </Field>
      <Field
        name="description"
        label={C.description.label}
        hint={C.description.hint}
        counter={`${description.length}/240`}
        full
      >
        <Textarea
          {...descriptionA11y}
          maxLength={240}
          rows={3}
          placeholder={C.description.placeholder}
          {...register('description')}
        />
      </Field>
      <CreativePicker imageUrl={imageUrl} onImage={onImage} />
    </Section>
  )
}
