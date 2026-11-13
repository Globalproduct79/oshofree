'use client'

import { useFormContext } from 'react-hook-form'
import { COPY } from '@/lib/copy'
import { tokens } from '@/lib/tokens'
import { Section } from './fields'
import type { FormValues } from './values'

const C = COPY.campaignForm

// Wall card is the only placement Phoenix serves in slice 1; the other three are shown, not offered.
export function PlacementSection() {
  const { register } = useFormContext<FormValues>()
  return (
    <Section title={C.sections.placement}>
      <fieldset className="grid grid-cols-2 gap-3 sm:col-span-full">
        <legend className="sr-only">{C.sections.placement}</legend>
        {C.placement.options.map((o) => (
          <label
            key={o.value}
            className={`flex flex-col gap-1 rounded-xl border p-3 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 ${o.enabled ? 'cursor-pointer' : 'cursor-not-allowed'}`}
            style={{
              borderColor: o.enabled ? tokens.accent : tokens.line,
              backgroundColor: o.enabled ? tokens.accentSoft : tokens.card,
            }}
          >
            {o.enabled ? (
              <input type="radio" value={o.value} className="sr-only" {...register('placement')} />
            ) : (
              <input type="radio" name="placement" value={o.value} disabled className="sr-only" />
            )}
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-semibold" style={{ color: o.enabled ? tokens.ink : tokens.ink3 }}>
                {o.label}
              </span>
              {!o.enabled && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{ backgroundColor: tokens.amberSoft, color: tokens.amber }}
                >
                  {C.placement.comingSoon}
                </span>
              )}
            </span>
            <span className="text-xs leading-snug" style={{ color: o.enabled ? tokens.ink2 : tokens.ink3 }}>
              {o.detail}
            </span>
          </label>
        ))}
      </fieldset>
    </Section>
  )
}
