import type { Campaign } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import {
  ACCEPT, campaignDefaults, fits, flightLength, newCampaignDefaults, offerInput, plusDays, previewEndsAt, revisionInput, toInput,
} from '@/components/campaign/form/values'
import { campaignDates, campaignInput, checkCampaign, ruleContext, ymd } from '@/lib/campaign-schema'

const lagos = {
  country: 'NG', name: 'n', brand: 'b', category: 'Retail', headline: 'h', description: 'd', tileColor: null,
  creativeImageKey: null, creativeVideoKey: null, placement: 'featured', redeemMethod: 'code', claimCode: 'X', linkUrl: null,
  budgetUsd: 300, rewardLocal: 50, startsAt: new Date('2026-11-30T23:00:00Z'), endsAt: new Date('2026-12-14T23:00:00Z'),
} as unknown as Campaign
const url = (key: string) => `/uploads/${key}`
const kola = { name: 'Kola Bright', type: 'Brand', country: 'NG' } as const
const NOW = new Date('2026-11-13T23:30:00Z') // already the 14th in Lagos

describe('campaignDefaults dates', () => {
  it('shows the market-local day, not the UTC day', () => {
    expect(ymd(lagos.startsAt, 'NG')).toBe('2026-12-01')
    expect(campaignDefaults(lagos, url).startsAt).toBe('2026-12-01')
  })
  it('round-trips through campaignDates unchanged', () => {
    const d = campaignDefaults(lagos, url)
    expect(d.runsFor).toBe('14')
    expect(campaignDates(d.startsAt, Number(d.runsFor), 'NG')).toEqual({ startsAt: lagos.startsAt, endsAt: lagos.endsAt })
  })
  it('a custom flight keeps its local end day', () => {
    const c = { ...lagos, endsAt: new Date('2026-12-09T23:00:00Z') } as Campaign
    const d = campaignDefaults(c, url)
    expect(d).toMatchObject({ runsFor: 'custom', endsAt: '2026-12-10' })
    expect(campaignDates(d.startsAt, undefined, 'NG', d.endsAt).endsAt).toEqual(c.endsAt)
  })
  it('prefills every field, the creative with its URL, terms unticked', () => {
    const d = campaignDefaults({ ...lagos, creativeVideoKey: 'k.mp4', linkUrl: 'https://x.ng' } as Campaign, url)
    expect(d).toMatchObject({
      placement: 'featured', creative: { key: 'k.mp4', kind: 'video', url: '/uploads/k.mp4' }, linkUrl: 'https://x.ng',
      budgetUsd: '300', rewardLocal: '50', termsAccepted: false, category: 'Retail',
    })
  })
})

describe('newCampaignDefaults', () => {
  it("ADV §3 defaults, starting tomorrow in the market", () => {
    expect(newCampaignDefaults(kola, NOW)).toMatchObject({
      brand: 'Kola Bright', country: 'NG', category: 'Food & drink', placement: 'card', redeemMethod: 'link',
      budgetUsd: '300', runsFor: '14', startsAt: '2026-11-15', rewardLocal: '50', termsAccepted: false, creative: null,
    })
  })
  it('an agency names its client', () => {
    expect(newCampaignDefaults({ ...kola, type: 'Agency' }, NOW).brand).toBe('')
  })
})

describe('form values to input', () => {
  const filled = () => ({
    ...newCampaignDefaults(kola, NOW), name: 'Easter bundle', headline: 'Free 50cl', description: 'Buy six.',
    linkUrl: 'https://kola.example', termsAccepted: true,
  })
  it('a filled form parses as a campaign', () => {
    expect(campaignInput.safeParse(toInput(filled())).success).toBe(true)
  })
  it('a code offer sends no link; a custom flight sends its end date', () => {
    const i = toInput({ ...filled(), redeemMethod: 'code', runsFor: 'custom', endsAt: '2026-12-01' })
    expect(i.linkUrl).toBeUndefined()
    expect(i).toMatchObject({ endsAt: '2026-12-01' })
    expect('runsForDays' in i).toBe(false)
  })
  it('a revision sends the offer fields only', () => {
    expect(Object.keys(offerInput(filled())).sort()).toEqual([
      'brand', 'category', 'creativeImageKey', 'creativeVideoKey', 'description', 'headline', 'linkUrl', 'placement',
      'redeemMethod', 'termsAccepted', 'tileColor',
    ])
  })
  it('an empty budget is refused by the budget rule, not read as 0', () => {
    const ctx = ruleContext('Brand', { limitCents: 150_000, inUseCents: 0 }, 'NG', undefined, NOW)
    expect(checkCampaign(toInput({ ...filled(), budgetUsd: '' }), ctx)).toEqual({ ok: false, field: 'budgetUsd', message: 'Minimum budget is $50.' })
    expect(checkCampaign(toInput({ ...filled(), budgetUsd: '55.5' }), ctx)).toEqual({
      ok: false, field: 'budgetUsd', message: 'Budget is in whole dollars.',
    })
    expect(checkCampaign(toInput({ ...filled(), name: 'E' }), ctx)).toEqual({
      ok: false, field: 'name', message: 'Give the campaign a name of 2 to 80 characters.',
    })
    expect(checkCampaign(toInput(filled()), ctx).ok).toBe(true)
  })
})

describe('ruleContext', () => {
  const credit = { limitCents: 150_000, inUseCents: 149_000 }
  it('a new campaign counts its whole budget and cannot start in the past', () => {
    expect(ruleContext('Brand', credit, 'NG', undefined, NOW)).toEqual({
      workspaceType: 'Brand', creditLimitCents: 150_000, creditInUseCents: 149_000, today: '2026-11-14',
    })
  })
  it('an in-place edit counts only what the budget adds over what it holds', () => {
    expect(ruleContext('Brand', credit, 'NG', { running: false, heldCents: 30_000 }, NOW)).toMatchObject({
      isEdit: true, previousBudgetUsd: 300,
    })
  })
  it('a revision is never over the limit', () => {
    const ctx = ruleContext('Brand', credit, 'NG', { running: true, heldCents: 30_000 }, NOW)
    const i = toInput({ ...newCampaignDefaults(kola, NOW), name: 'E bundle', headline: 'h', description: 'd', linkUrl: 'https://x.ng', termsAccepted: true })
    expect(checkCampaign(i, ctx).ok).toBe(true)
  })
})

describe('revisionInput', () => {
  it('judges the offer with stand-in money and timing, so locked fields can never block it', () => {
    const ctx = ruleContext('Brand', { limitCents: 0, inUseCents: 0 }, 'NG', { running: true, heldCents: 4_000 }, NOW)
    const v = {
      ...newCampaignDefaults(kola, NOW), name: 'Old run', headline: 'h', description: 'd', linkUrl: 'https://x.ng',
      budgetUsd: '40', runsFor: 'custom' as const, startsAt: '2026-01-01', endsAt: '2026-12-01', termsAccepted: true,
    }
    expect(checkCampaign(toInput(v), ctx)).toEqual({ ok: false, field: 'budgetUsd', message: 'Minimum budget is $50.' })
    expect(checkCampaign(revisionInput(v), ctx).ok).toBe(true)
    expect(checkCampaign(revisionInput({ ...v, headline: '' }), ctx)).toEqual({ ok: false, field: 'headline', message: 'Write the offer headline.' })
  })
})

describe('helpers', () => {
  it('fits: an image for a card or tile, an MP4 for video, either for splash', () => {
    const image = { key: 'k.png', kind: 'image', url: '/u' } as const
    const video = { key: 'k.mp4', kind: 'video', url: '/u' } as const
    expect([fits('card', image), fits('featured', image), fits('video', image), fits('splash', image)]).toEqual([true, true, false, true])
    expect([fits('card', video), fits('featured', video), fits('video', video), fits('splash', video)]).toEqual([false, false, true, true])
    expect(fits('video', null)).toBe(true)
  })
  it('fits: an image past the placement\'s cap does not, so a 3 MB splash image leaves when the placement becomes a card', () => {
    const image = (bytes?: number) => ({ key: 'k.png', kind: 'image', url: '/u', bytes }) as const
    const mb = 1024 * 1024
    expect([fits('splash', image(3 * mb)), fits('card', image(3 * mb)), fits('featured', image(3 * mb))]).toEqual([true, false, false])
    expect([fits('card', image(2 * mb)), fits('splash', image(4 * mb)), fits('splash', image(4 * mb + 1))]).toEqual([true, true, false])
    // A creative from before sizes were kept (Edit offer, an old draft) is judged by its kind only.
    expect(fits('card', image())).toBe(true)
    expect(fits('splash', { key: 'k.mp4', kind: 'video', url: '/u', bytes: 20 * mb })).toBe(true)
  })
  it('ACCEPT: the picker offers only the types each placement takes', () => {
    expect(ACCEPT).toEqual({
      card: 'image/jpeg,image/png,image/webp',
      featured: 'image/jpeg,image/png,image/webp',
      video: 'video/mp4',
      splash: 'image/jpeg,image/png,image/webp,video/mp4',
    })
  })
  it('flightLength: the preset, or the custom days while usable', () => {
    const v = { runsFor: 'custom', startsAt: '2026-12-01', endsAt: '2026-12-11' } as const
    expect(flightLength({ ...v, runsFor: '30' })).toBe(30)
    expect(flightLength(v)).toBe(10)
    expect(flightLength({ ...v, endsAt: '2026-12-01' })).toBeNull()
    expect(flightLength({ ...v, endsAt: '' })).toBeNull()
  })
  it('plusDays and previewEndsAt never throw on a day off the calendar', () => {
    expect(plusDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(plusDays('2026-13-45', 3)).toBe('')
    const v = { ...newCampaignDefaults(kola, NOW), startsAt: '2026-13-45' }
    expect(previewEndsAt(v, NOW).getTime()).toBe(NOW.getTime() + 86_400_000)
    expect(previewEndsAt({ ...v, startsAt: '2026-12-01' }, NOW).toISOString()).toBe('2026-12-14T23:00:00.000Z')
  })
})
