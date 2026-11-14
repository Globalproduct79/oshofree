'use client'

import { CAMPAIGN_FORM_COPY as F } from '@/lib/copy-campaign-form'
import { MARKETS } from '@/lib/markets'
import { flightLength, plusDays, type FormValues, type RunsFor } from './values'

const L = F.fields

type Props = {
  values: FormValues
  update: (patch: Partial<FormValues>) => void
  // A running campaign's money and timing change without review on its page (spec §6.14.3).
  locked: boolean
  // The market's today: a new campaign cannot start before it.
  minStart?: string
}

// ADV §3 fields 10–15: redeem and link, budget, runs for (and a custom end date), start, reward.
export function TermsFields({ values: v, update, locked, minStart }: Props) {
  function runFor(runsFor: RunsFor) {
    // A custom flight starts from the preset's end, so switching changes nothing until a date is picked.
    const endsAt = runsFor === 'custom' && !v.endsAt ? plusDays(v.startsAt, flightLength(v) ?? 14) : v.endsAt
    update({ runsFor, endsAt })
  }
  return (
    <>
      <label className="f">
        {L.redeem.label}
        <select value={v.redeemMethod} onChange={(e) => update({ redeemMethod: e.target.value as FormValues['redeemMethod'] })}>
          <option value="code">{L.redeem.options.code}</option>
          <option value="link">{L.redeem.options.link}</option>
        </select>
      </label>
      <label className="f">
        {L.link.label} <small>{L.link.hint}</small>
        <input
          value={v.linkUrl}
          disabled={v.redeemMethod === 'code'}
          placeholder={L.link.placeholder}
          inputMode="url"
          onChange={(e) => update({ linkUrl: e.target.value })}
        />
      </label>
      {locked && (
        <p className="full" style={{ margin: 0, fontSize: 13, color: 'var(--ink3)' }}>
          {F.locked.terms}
        </p>
      )}
      <label className="f">
        {L.budget.label} <small>{L.budget.hint}</small>
        <input
          type="number"
          min={50}
          step={10}
          disabled={locked}
          value={v.budgetUsd}
          onChange={(e) => update({ budgetUsd: e.target.value })}
        />
      </label>
      <label className="f">
        {L.runsFor.label}
        <select value={v.runsFor} disabled={locked} onChange={(e) => runFor(e.target.value as RunsFor)}>
          {L.runsFor.options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      <label className="f">
        {L.startsAt.label}
        <input type="date" min={minStart} disabled={locked} value={v.startsAt} onChange={(e) => update({ startsAt: e.target.value })} />
      </label>
      {v.runsFor === 'custom' && (
        <label className="f">
          {L.endsAt.label}
          <input
            type="date"
            min={plusDays(v.startsAt, 1) || undefined}
            disabled={locked}
            value={v.endsAt}
            onChange={(e) => update({ endsAt: e.target.value })}
          />
        </label>
      )}
      <label className="f">
        {L.reward.label} <small>{L.reward.hint(MARKETS[v.country].currency)}</small>
        <input
          type="number"
          min={0}
          step={5}
          disabled={locked}
          value={v.rewardLocal}
          onChange={(e) => update({ rewardLocal: e.target.value })}
        />
      </label>
    </>
  )
}
