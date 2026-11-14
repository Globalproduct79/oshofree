import { describe, expect, it } from 'vitest'
import {
  ageGated, campaignDates, campaignDraftInput, campaignInput, flightDays, validateCampaign,
  type CampaignInput, type ValidationContext,
} from '@/lib/campaign-schema'
import { CAMPAIGN_FORM_COPY } from '@/lib/copy-campaign-form'

const valid: CampaignInput = {
  name: 'Harmattan Sale',
  brand: 'Acme Foods',
  country: 'NG',
  category: 'Food & drink',
  headline: 'Buy one, get one free',
  description: 'Show the code at any Acme outlet to get a free second item.',
  tileColor: '#FF5A1F',
  placement: 'card',
  redeemMethod: 'code',
  claimCode: 'ACME1',
  budgetUsd: 300,
  rewardLocal: 50,
  startsAt: '2026-12-01',
  runsForDays: 14,
  termsAccepted: true,
}
const ctx: ValidationContext = { workspaceType: 'Brand', creditLimitCents: 150_000, creditInUseCents: 0 }
const check = (patch: Partial<CampaignInput>, c: Partial<ValidationContext> = {}) =>
  validateCampaign({ ...valid, ...patch }, { ...ctx, ...c })

describe('validateCampaign', () => {
  it('passes a valid input', () => expect(check({})).toBeNull())

  it.each([
    ['name', { name: '  ' }, 'Give the campaign a name.'],
    ['brand', { brand: '' }, 'Which brand is this for?'],
    ['headline', { headline: '' }, 'Write the offer headline.'],
    ['description', { description: ' ' }, 'Describe what the consumer gets.'],
    ['licence (category)', { category: 'Betting' }, 'Betting and draw offers need a licence or approval number in the description.'],
    ['licence (draw)', { headline: 'Win the draw' }, 'Betting and draw offers need a licence or approval number in the description.'],
    ['http link', { redeemMethod: 'link', linkUrl: 'http://acme.com' }, 'Online offers need an https:// link.'],
    ['no link', { redeemMethod: 'link', linkUrl: undefined }, 'Online offers need an https:// link.'],
    ['video without creative', { placement: 'video' }, 'Video and splash need a creative attached.'],
    ['splash without creative', { placement: 'splash' }, 'Video and splash need a creative attached.'],
    ['budget', { budgetUsd: 49 }, 'Minimum budget is $50.'],
    ['terms', { termsAccepted: false as unknown as true }, 'Confirm the offer is genuine.'],
  ] as const)('%s', (_n, patch, msg) => expect(check(patch)).toBe(msg))

  it('accepts a licence number, a link, and attached creatives', () => {
    expect(check({ category: 'Betting', description: 'Licensed by NLRC 123.' })).toBeNull()
    expect(check({ redeemMethod: 'link', linkUrl: 'https://acme.com' })).toBeNull()
    expect(check({ placement: 'video', creativeVideoKey: 'x' })).toBeNull()
    expect(check({ placement: 'splash', creativeImageKey: 'x' })).toBeNull()
    expect(check({ placement: 'splash', creativeVideoKey: 'x' })).toBeNull()
    expect(check({ placement: 'video', creativeImageKey: 'x' })).toBe('Video and splash need a creative attached.')
  })

  it('reports the first failing rule when several fail', () => {
    const bad = { name: '', brand: '', headline: '', budgetUsd: 10, termsAccepted: false as unknown as true }
    expect(check(bad)).toBe('Give the campaign a name.')
    expect(check({ ...bad, name: 'x' })).toBe('Which brand is this for?')
    expect(check({ ...bad, name: 'x', brand: 'y' })).toBe('Write the offer headline.')
    expect(check({ ...bad, name: 'x', brand: 'y', headline: 'h' })).toBe('Minimum budget is $50.')
    expect(check({ placement: 'video', budgetUsd: 10 })).toBe('Video and splash need a creative attached.')
    expect(check({ budgetUsd: 10 }, { creditLimitCents: 0 })).toBe('Minimum budget is $50.')
    expect(check({ termsAccepted: false as unknown as true }, { creditLimitCents: 0 })).toMatch(/^Over your credit limit/)
  })

  it('the credit rule states the limit and the excess', () => {
    expect(check({}, { creditLimitCents: 150_000, creditInUseCents: 120_202 })).toBe(
      'Over your credit limit of $1,500 by $2. Pay an open invoice or ask Global to raise it.',
    )
    expect(check({}, { creditLimitCents: 150_000, creditInUseCents: 120_000 })).toBeNull()
    expect(check({ budgetUsd: 1500 }, { creditLimitCents: 150_000, creditInUseCents: 120_202 })).toBe(
      'Over your credit limit of $1,500 by $1,202. Pay an open invoice or ask Global to raise it.',
    )
  })

  it('on an edit only the budget increase counts', () => {
    const e = { isEdit: true, creditLimitCents: 100_000, creditInUseCents: 90_000 }
    expect(check({ budgetUsd: 300 }, { ...e, previousBudgetUsd: 300 })).toBeNull()
    expect(check({ budgetUsd: 400 }, { ...e, previousBudgetUsd: 300 })).toBeNull()
    expect(check({ budgetUsd: 500 }, { ...e, previousBudgetUsd: 300 })).toBe(
      'Over your credit limit of $1,000 by $100. Pay an open invoice or ask Global to raise it.',
    )
    expect(check({ budgetUsd: 100 }, { ...e, previousBudgetUsd: 300 })).toBeNull()
  })

  it('the date rules sit after the budget and before credit', () => {
    expect(check({ startsAt: '2026-11-01' }, { today: '2026-11-14' })).toBe("Start date can't be in the past.")
    expect(check({ startsAt: '2026-11-01' }, { today: '2026-11-14', isEdit: true })).toBeNull()
    expect(check({ startsAt: '2026-11-01', budgetUsd: 10 }, { today: '2026-11-14' })).toBe('Minimum budget is $50.')
    const flight = 'The flight must end after it starts and run 90 days at most.'
    const custom = { runsForDays: undefined }
    expect(check({ ...custom, endsAt: '2026-12-01' })).toBe(flight)
    expect(check({ ...custom, endsAt: '2026-11-30' })).toBe(flight)
    expect(check({ ...custom, endsAt: '2027-03-02' })).toBe(flight)
    expect(check({ ...custom, endsAt: '2027-03-01' })).toBeNull()
    expect(check({ ...custom, endsAt: '2026-12-02' }, { creditLimitCents: 0 })).toMatch(/^Over your credit limit/)
  })

  it('keeps the copy file in step', () => {
    expect(CAMPAIGN_FORM_COPY.validation.name).toBe('Give the campaign a name.')
  })
})

describe('ageGated', () => {
  it('Betting, or jackpot / bet in the headline', () => {
    expect(ageGated({ category: 'Betting', headline: 'x' })).toBe(true)
    expect(ageGated({ category: 'Retail', headline: 'Win the Jackpot' })).toBe(true)
    expect(ageGated({ category: 'Retail', headline: 'Bet on it' })).toBe(true)
    expect(ageGated({ category: 'Retail', headline: 'Win the draw' })).toBe(false)
    expect(ageGated({ category: 'Food & drink', headline: 'Buy one' })).toBe(false)
  })
})

describe('campaignDates', () => {
  it('starts at the market\'s local midnight', () => {
    expect(campaignDates('2026-12-01', 14, 'NG').startsAt.toISOString()).toBe('2026-11-30T23:00:00.000Z')
    expect(campaignDates('2026-12-01', 14, 'KE').startsAt.toISOString()).toBe('2026-11-30T21:00:00.000Z')
    expect(campaignDates('2026-12-01', 14, 'TZ').startsAt.toISOString()).toBe('2026-11-30T21:00:00.000Z')
    expect(campaignDates('2026-12-01', 14, 'GH').startsAt.toISOString()).toBe('2026-12-01T00:00:00.000Z')
    expect(campaignDates('2026-12-01', 14, 'SN').startsAt.toISOString()).toBe('2026-12-01T00:00:00.000Z')
  })
  it('ends runsForDays later, or at a custom end date', () => {
    expect(campaignDates('2026-12-01', 14, 'NG').endsAt.toISOString()).toBe('2026-12-14T23:00:00.000Z')
    expect(campaignDates('2026-12-01', undefined, 'NG', '2026-12-10').endsAt.toISOString()).toBe('2026-12-09T23:00:00.000Z')
  })
  it('flightDays counts whole days', () => {
    expect(flightDays('2026-12-01', '2026-12-15')).toBe(14)
    expect(flightDays('2026-12-01', '2026-12-01')).toBe(0)
  })
})

describe('campaignInput', () => {
  it('takes a preset or a custom flight, never both or neither', () => {
    expect(campaignInput.safeParse(valid).success).toBe(true)
    const rest: Partial<CampaignInput> = { ...valid, runsForDays: undefined }
    expect(campaignInput.safeParse({ ...rest, endsAt: '2026-12-10' }).success).toBe(true)
    expect(campaignInput.safeParse({ ...valid, endsAt: '2026-12-10' }).success).toBe(false)
    expect(campaignInput.safeParse(rest).success).toBe(false)
    expect(campaignInput.safeParse({ ...valid, runsForDays: 10 }).success).toBe(false)
  })
  it('requires a tile colour and a whole, non-negative reward', () => {
    const noColour = { ...valid, tileColor: undefined }
    expect(campaignInput.safeParse(noColour).success).toBe(false)
    expect(campaignInput.safeParse({ ...valid, rewardLocal: -1 }).success).toBe(false)
    expect(campaignInput.safeParse({ ...valid, rewardLocal: 0 }).success).toBe(true)
  })
  it('a draft may be saved with the confirmation unticked; a submission may not', () => {
    expect(campaignDraftInput.safeParse({ ...valid, termsAccepted: false }).success).toBe(true)
    expect(campaignInput.safeParse({ ...valid, termsAccepted: false }).success).toBe(false)
  })
})
