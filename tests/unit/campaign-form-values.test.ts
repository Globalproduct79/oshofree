import type { Campaign } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { campaignDates } from '@/lib/campaign-schema'
import { campaignDefaults, ymd } from '@/components/campaign/form/values'

const lagos = {
  country: 'NG', name: 'n', brand: 'b', category: 'Retail', headline: 'h', description: 'd', tileColor: null,
  creativeImageKey: null, redeemMethod: 'code', claimCode: 'X', linkUrl: null, budgetUsd: 300, rewardLocal: 50,
  startsAt: new Date('2026-11-30T23:00:00Z'), endsAt: new Date('2026-12-14T23:00:00Z'),
} as unknown as Campaign

describe('campaignDefaults dates', () => {
  it('shows the market-local day, not the UTC day', () => {
    expect(ymd(lagos.startsAt, 'NG')).toBe('2026-12-01')
    expect(campaignDefaults(lagos).startsAt).toBe('2026-12-01')
  })
  it('round-trips through campaignDates unchanged', () => {
    const d = campaignDefaults(lagos)
    const back = campaignDates(d.startsAt!, d.runsForDays, 'NG', d.endsAt)
    expect(back).toEqual({ startsAt: lagos.startsAt, endsAt: lagos.endsAt })
  })
  it('a custom flight keeps its local end day', () => {
    const c = { ...lagos, endsAt: new Date('2026-12-09T23:00:00Z') } as Campaign
    const d = campaignDefaults(c)
    expect(d.endsAt).toBe('2026-12-10')
    expect(campaignDates(d.startsAt!, d.runsForDays, 'NG', d.endsAt).endsAt).toEqual(c.endsAt)
  })
})
