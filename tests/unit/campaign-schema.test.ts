import { describe, expect, it } from 'vitest'
import {
  ageGated, BRAND_MAX, campaignDates, campaignDraftInput, campaignInput, checkCampaign, DESCRIPTION_MAX, firstRefusal,
  flightDays, HEADLINE_MAX, isBettingOrDraw, isHttpsLink, MAX_REWARD_LOCAL, NAME_MAX, NAME_MIN, validateCampaign,
  type CampaignInput, type ValidationContext,
} from '@/lib/campaign-schema'
import { CAMPAIGN_FORM_COPY } from '@/lib/copy-campaign-form'
import { expectCopySentence } from '../stubs/copy-sentence'
import { MAX_LIMIT_CENTS } from '@/lib/money'

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

  it('refuses a creative that does not match the placement, after the dates and before credit', () => {
    const mismatch = "The creative doesn't match the placement."
    expect(check({ placement: 'card', creativeVideoKey: 'v.mp4' })).toBe(mismatch)
    expect(check({ placement: 'featured', creativeVideoKey: 'v.mp4' })).toBe(mismatch)
    // An image alone under Video already fails the earlier "needs a creative" rule.
    expect(check({ placement: 'video', creativeImageKey: 'i.png' })).toBe('Video and splash need a creative attached.')
    expect(check({ placement: 'video', creativeImageKey: 'i.png', creativeVideoKey: 'v.mp4' })).toBe(mismatch)
    expect(check({ placement: 'splash', creativeImageKey: 'i.png', creativeVideoKey: 'v.mp4' })).toBe(mismatch)
    expect(check({ placement: 'card', creativeImageKey: 'i.png', creativeVideoKey: 'v.mp4' })).toBe(mismatch)
    expect(check({ placement: 'card', creativeImageKey: 'i.png' })).toBeNull()
    expect(check({ placement: 'featured', creativeImageKey: 'i.png' })).toBeNull()
    expect(check({ placement: 'card', creativeVideoKey: 'v.mp4', budgetUsd: 10 })).toBe('Minimum budget is $50.')
    expect(check({ placement: 'card', creativeVideoKey: 'v.mp4' }, { creditLimitCents: 0 })).toBe(mismatch)
  })

  it('reports the first failing rule when several fail', () => {
    const bad = { name: '', brand: '', headline: '', budgetUsd: 10, termsAccepted: false as unknown as true }
    expect(check(bad)).toBe('Give the campaign a name.')
    expect(check({ ...bad, name: 'x' })).toBe('Give the campaign a name of 2 to 80 characters.')
    expect(check({ ...bad, name: 'xy' })).toBe('Which brand is this for?')
    expect(check({ ...bad, name: 'xy', brand: 'y' })).toBe('Write the offer headline.')
    expect(check({ ...bad, name: 'xy', brand: 'y', headline: 'h' })).toBe('Minimum budget is $50.')
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

  it('refuses a reward past the ceiling the credit limit and budget share, after the budget rule', () => {
    expect(MAX_REWARD_LOCAL).toBe(Math.floor(MAX_LIMIT_CENTS / 100))
    expect(check({ rewardLocal: MAX_REWARD_LOCAL + 1 })).toBe('That reward is too large.')
    expect(check({ rewardLocal: 3_000_000_000 })).toBe('That reward is too large.')
    expect(check({ rewardLocal: MAX_REWARD_LOCAL })).toBeNull()
    expect(check({ rewardLocal: MAX_REWARD_LOCAL + 1, budgetUsd: 10 })).toBe('Minimum budget is $50.')
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

  it('reads "bet" as a word: a better deal is not a bet', () => {
    for (const headline of ['Bets from ₦100', 'Sports betting week', 'Bet9ja welcome bonus', 'Megajackpot weekend'])
      expect(ageGated({ category: 'Retail', headline })).toBe(true)
    for (const headline of ['Better data deals', 'Between 2 and 4pm', 'Alphabet soup, 2 for 1'])
      expect(ageGated({ category: 'Telecom & data', headline })).toBe(false)
  })
})

describe('isBettingOrDraw', () => {
  it('reads "draw" as a word: free withdrawals are not a draw', () => {
    for (const headline of ['Win in our draw', 'Weekly draws', 'Prize drawing on Friday', 'Jackpot Friday'])
      expect(isBettingOrDraw({ category: 'Retail', headline })).toBe(true)
    for (const headline of ['Free withdrawals this week', 'Withdraw at any agent', 'A free drawer organiser'])
      expect(isBettingOrDraw({ category: 'Banking & fintech', headline })).toBe(false)
    expect(check({ category: 'Banking & fintech', headline: 'Free withdrawals this week' })).toBeNull()
  })
})

describe('the text limits', () => {
  it('are one set of numbers: the schema refuses one past each, and the sentence names it', () => {
    expect([NAME_MIN, NAME_MAX, BRAND_MAX, HEADLINE_MAX, DESCRIPTION_MAX]).toEqual([2, 80, 80, 48, 240])
    expect(campaignInput.safeParse({ ...valid, headline: 'h'.repeat(HEADLINE_MAX) }).success).toBe(true)
    expect(campaignInput.safeParse({ ...valid, headline: 'h'.repeat(HEADLINE_MAX + 1) }).success).toBe(false)
    expect(campaignInput.safeParse({ ...valid, description: 'd'.repeat(DESCRIPTION_MAX + 1) }).success).toBe(false)
    expect(campaignInput.safeParse({ ...valid, name: 'n'.repeat(NAME_MAX + 1) }).success).toBe(false)
    expect(check({ headline: 'h'.repeat(HEADLINE_MAX + 1) })).toBe('Keep the headline to 48 characters.')
    expect(check({ name: 'n'.repeat(NAME_MAX + 1) })).toBe('Give the campaign a name of 2 to 80 characters.')
  })
})

describe('isHttpsLink', () => {
  it('takes an https address with a real host and nothing else', () => {
    for (const ok of ['https://kolabright.com', 'https://kolabright.com/offer?x=1', 'HTTPS://Kolabright.com', ' https://a.ng '])
      expect(isHttpsLink(ok)).toBe(true)
    for (const bad of [undefined, '', 'https://', 'https://kola bright', 'https://kolabright', 'http://kolabright.com', 'kolabright.com', 'https://.com'])
      expect(isHttpsLink(bad)).toBe(false)
  })
})

describe('firstRefusal: each rule names its field, in the order the form shows them', () => {
  const X = CAMPAIGN_FORM_COPY.invalid
  const V = CAMPAIGN_FORM_COPY.validation
  const first = (patch: Partial<CampaignInput>, c: Partial<ValidationContext> = {}) =>
    firstRefusal({ ...valid, ...patch }, { ...ctx, ...c })

  it.each([
    ['empty name', { name: ' ' }, 'name', V.name],
    ['one-letter name', { name: 'E' }, 'name', X.name(2, 80)],
    ['empty brand', { brand: '' }, 'brand', V.brand],
    ['long brand', { brand: 'b'.repeat(81) }, 'brand', X.brand(80)],
    ['empty headline', { headline: '' }, 'headline', V.headline],
    ['long headline', { headline: 'h'.repeat(49) }, 'headline', X.headline(48)],
    ['empty description', { description: '' }, 'description', V.description],
    ['long description', { description: 'd'.repeat(241) }, 'description', X.description(240)],
    ['licence', { category: 'Betting' }, 'description', V.licence],
    ['http link', { redeemMethod: 'link', linkUrl: 'http://acme.com' }, 'linkUrl', V.link],
    ['bare https://', { redeemMethod: 'link', linkUrl: 'https://' }, 'linkUrl', V.linkInvalid],
    ['a space in the host', { redeemMethod: 'link', linkUrl: 'https://acme foods.com' }, 'linkUrl', V.linkInvalid],
    ['video without creative', { placement: 'video' }, 'creative', V.creative],
    ['budget under 50', { budgetUsd: 49 }, 'budgetUsd', V.budget],
    ['empty budget', { budgetUsd: Number.NaN }, 'budgetUsd', V.budget],
    ['budget in cents', { budgetUsd: 55.5 }, 'budgetUsd', X.budgetUsd],
    ['empty reward', { rewardLocal: Number.NaN }, 'rewardLocal', X.rewardLocal],
    ['negative reward', { rewardLocal: -5 }, 'rewardLocal', X.rewardLocal],
    ['fractional reward', { rewardLocal: 2.5 }, 'rewardLocal', X.rewardLocal],
    ['reward too large', { rewardLocal: MAX_REWARD_LOCAL + 1 }, 'rewardLocal', V.rewardTooLarge],
    ['empty start date', { startsAt: '' }, 'startsAt', X.startsAt],
    ['start date not on the calendar', { startsAt: '2026-02-30' }, 'startsAt', X.startsAt],
    ['empty end date', { runsForDays: undefined, endsAt: '' }, 'endsAt', X.endsAt],
    ['end before start', { runsForDays: undefined, endsAt: '2026-11-30' }, 'endsAt', V.flight],
    ['mismatched creative', { creativeVideoKey: 'v.mp4' }, 'creative', V.creativeMismatch],
    ['credit', { budgetUsd: 2000 }, 'budgetUsd', 'Over your credit limit of $1,500 by $500. Pay an open invoice or ask Global to raise it.'],
    ['terms', { termsAccepted: false as unknown as true }, 'termsAccepted', V.terms],
  ] as const)('%s', (_n, patch, field, message) => expect(first(patch as Partial<CampaignInput>)).toEqual({ field, message }))

  it('an empty start date is asked for, not called past', () => {
    expect(first({ startsAt: '' }, { today: '2026-11-14' })?.message).toBe('Pick a start date.')
    expect(first({ startsAt: '2026-11-01' }, { today: '2026-11-14' })).toEqual({ field: 'startsAt', message: V.startPast })
  })

  it("a field's own shape is judged in its place: a one-letter name is said before an empty headline", () => {
    expect(first({ name: 'E', headline: '' })?.field).toBe('name')
    expect(first({ budgetUsd: 55.5, rewardLocal: -1, startsAt: '' })?.field).toBe('budgetUsd')
    expect(first({ rewardLocal: -1, startsAt: '' })?.field).toBe('rewardLocal')
  })
})

describe('checkCampaign: every refusal is a sentence from the copy file', () => {
  const refused = (raw: unknown) => {
    const r = checkCampaign(raw, ctx)
    if (r.ok) throw new Error('expected a refusal')
    return r
  }

  it('answers what only a crafted request can send with the copy, naming the field where there is one', () => {
    expect(refused({ ...valid, country: 'ZZ' })).toEqual({ ok: false, field: 'country', message: CAMPAIGN_FORM_COPY.invalid.other })
    expect(refused({ ...valid, tileColor: 'red' })).toEqual({ ok: false, field: 'tileColor', message: CAMPAIGN_FORM_COPY.invalid.other })
    expect(refused({ ...valid, runsForDays: 9 })).toEqual({ ok: false, field: 'runsFor', message: CAMPAIGN_FORM_COPY.invalid.other })
    expect(refused({ ...valid, creativeImageKey: '../etc/passwd' }).field).toBe('creative')
  })

  it('never shows the schema its own words, whatever arrives', () => {
    for (const raw of [
      null, 'x', {}, { ...valid, name: 7 }, { ...valid, budgetUsd: '300' }, { ...valid, rewardLocal: '50' },
      { ...valid, startsAt: 20261201 }, { ...valid, runsForDays: undefined }, { ...valid, endsAt: '2026-12-09' },
      { ...valid, placement: 'billboard' }, { ...valid, redeemMethod: 'sms' }, { ...valid, claimCode: '' },
    ]) {
      const r = checkCampaign(raw, ctx)
      expect(r.ok).toBe(false)
      if (!r.ok) expectCopySentence(r.message, JSON.stringify(raw))
    }
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
  it('takes only days that are on the calendar', () => {
    expect(campaignInput.safeParse({ ...valid, startsAt: '2026-02-30' }).success).toBe(false)
    expect(campaignInput.safeParse({ ...valid, startsAt: '2026-13-45' }).success).toBe(false)
    expect(campaignInput.safeParse({ ...valid, startsAt: '2028-02-29' }).success).toBe(true)
    const custom = { ...valid, runsForDays: undefined }
    expect(campaignInput.safeParse({ ...custom, endsAt: '2026-11-31' }).success).toBe(false)
  })
  it('requires a tile colour and a whole, non-negative reward', () => {
    const noColour = { ...valid, tileColor: undefined }
    expect(campaignInput.safeParse(noColour).success).toBe(false)
    expect(campaignInput.safeParse({ ...valid, rewardLocal: -1 }).success).toBe(false)
    expect(campaignInput.safeParse({ ...valid, rewardLocal: 0 }).success).toBe(true)
    expect(campaignInput.safeParse({ ...valid, rewardLocal: MAX_REWARD_LOCAL }).success).toBe(true)
    expect(campaignInput.safeParse({ ...valid, rewardLocal: MAX_REWARD_LOCAL + 1 }).success).toBe(false)
    expect(campaignDraftInput.safeParse({ ...valid, rewardLocal: MAX_REWARD_LOCAL + 1 }).success).toBe(false)
  })
  it('a draft may be saved with the confirmation unticked; a submission may not', () => {
    expect(campaignDraftInput.safeParse({ ...valid, termsAccepted: false }).success).toBe(true)
    expect(campaignInput.safeParse({ ...valid, termsAccepted: false }).success).toBe(false)
  })
})
