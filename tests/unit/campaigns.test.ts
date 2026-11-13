import { describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import {
  campaignInput,
  createCampaign,
  pauseCampaign,
  resumeCampaign,
  submitCampaign,
  updateCampaign,
  validateCampaign,
  type CampaignInput,
} from '@/lib/campaigns'

const valid: CampaignInput = {
  name: 'Harmattan Sale',
  brand: 'Acme Foods',
  country: 'NG',
  category: 'Food & drink',
  headline: 'Buy one, get one free',
  description: 'Show the code at any Acme outlet to get a free second item.',
  placement: 'card',
  redeemMethod: 'code',
  claimCode: 'ACME1',
  budgetUsd: 50,
  startsAt: '2026-12-01',
  runsForDays: 14,
  shareRewardLabel: 'Free drink',
  termsAccepted: true,
}

async function makeCampaign() {
  const ws = await db.workspace.create({ data: { name: 'Acme', type: 'Brand', country: 'NG' } })
  return createCampaign(ws.id, valid)
}

describe('campaignInput', () => {
  it('accepts a valid input', () => {
    expect(campaignInput.safeParse(valid).success).toBe(true)
  })
  it('limits the headline to 48 characters', () => {
    expect(campaignInput.safeParse({ ...valid, headline: 'a'.repeat(48) }).success).toBe(true)
    expect(campaignInput.safeParse({ ...valid, headline: 'a'.repeat(49) }).success).toBe(false)
  })
  it('accepts only the card placement', () => {
    expect(campaignInput.safeParse({ ...valid, placement: 'video' }).success).toBe(false)
  })
  it('accepts only an image key putImage could have made', () => {
    const key = '0b6f2a8e-3c1d-4e5f-9a7b-1c2d3e4f5a6b.png'
    expect(campaignInput.safeParse({ ...valid, creativeImageKey: key }).success).toBe(true)
    expect(campaignInput.safeParse({ ...valid, creativeImageKey: '../x.png' }).success).toBe(false)
  })
})

describe('campaignInput linkUrl', () => {
  it('stores the link as a valid Location: percent-encoded path, punycoded host', () => {
    const parse = (linkUrl: string) => campaignInput.parse({ ...valid, redeemMethod: 'link', linkUrl }).linkUrl
    expect(parse(' https://kolabright.ng/₦50 off ')).toBe('https://kolabright.ng/%E2%82%A650%20off')
    expect(parse('https://bücher.example/é?q=ñ')).toBe('https://xn--bcher-kva.example/%C3%A9?q=%C3%B1')
    expect(parse('not a url')).toBe('not a url')
  })
})

describe('validateCampaign', () => {
  it('passes a valid input', () => expect(validateCampaign(valid)).toBeNull())
  it('asks for a name', () =>
    expect(validateCampaign({ ...valid, name: '  ' })).toBe('Give the campaign a name.'))
  it('asks for a brand', () =>
    expect(validateCampaign({ ...valid, brand: '' })).toBe('Which brand is this for?'))
  it('asks for a headline', () =>
    expect(validateCampaign({ ...valid, headline: '' })).toBe('Write the offer headline.'))
  it('asks for a description', () =>
    expect(validateCampaign({ ...valid, description: '' })).toBe('Describe what the consumer gets.'))
  it('requires a licence for betting offers', () => {
    const msg = 'Betting and draw offers need a licence or approval number in the description.'
    expect(validateCampaign({ ...valid, category: 'Betting' })).toBe(msg)
    expect(validateCampaign({ ...valid, headline: 'Win the Jackpot' })).toBe(msg)
    expect(
      validateCampaign({ ...valid, category: 'Betting', description: 'Licensed by NLRC 123.' }),
    ).toBeNull()
  })
  it('requires https for link offers', () => {
    const link = { ...valid, redeemMethod: 'link' as const, claimCode: undefined }
    expect(validateCampaign({ ...link, linkUrl: 'http://acme.com' })).toBe(
      'Online offers need an https:// link.',
    )
    expect(validateCampaign(link)).toBe('Online offers need an https:// link.')
    expect(validateCampaign({ ...link, linkUrl: 'https://acme.com' })).toBeNull()
  })
  it('requires a claim code for code offers', () =>
    expect(validateCampaign({ ...valid, claimCode: undefined })).toBe(
      'Add the claim code consumers will show.',
    ))
  it('enforces the minimum budget', () =>
    expect(validateCampaign({ ...valid, budgetUsd: 49 })).toBe('Minimum budget is $50.'))
  it('requires the genuine-offer confirmation', () =>
    expect(validateCampaign({ ...valid, termsAccepted: false as unknown as true })).toBe(
      'Confirm the offer is genuine.',
    ))
})

describe('campaign lifecycle', () => {
  it('creates a draft with endsAt = startsAt + runsForDays', async () => {
    const c = await makeCampaign()
    expect(c.status).toBe('draft')
    expect(c.startsAt.toISOString()).toBe('2026-12-01T00:00:00.000Z')
    expect(c.endsAt.toISOString()).toBe('2026-12-15T00:00:00.000Z')
  })
  it('submits a draft to review', async () => {
    const c = await makeCampaign()
    const s = await submitCampaign(c.id)
    expect(s.status).toBe('review')
    expect(s.submittedAt).not.toBeNull()
  })
  it('clears the reject reason when a rejected campaign is resubmitted', async () => {
    const c = await makeCampaign()
    await db.campaign.update({ where: { id: c.id }, data: { status: 'rejected', rejectReason: 'Blurry' } })
    const s = await submitCampaign(c.id)
    expect(s.status).toBe('review')
    expect(s.rejectReason).toBeNull()
  })
  it('refuses to submit a campaign already in review and leaves the row unchanged', async () => {
    const first = await submitCampaign((await makeCampaign()).id)
    await expect(submitCampaign(first.id)).rejects.toBe('INVALID_TRANSITION')
    const after = await db.campaign.findUniqueOrThrow({ where: { id: first.id } })
    expect(after.status).toBe('review')
    expect(after.submittedAt).toEqual(first.submittedAt)
  })
  it('stores an empty link as null', async () => {
    const ws = await db.workspace.create({ data: { name: 'Acme', type: 'Brand', country: 'NG' } })
    expect((await createCampaign(ws.id, { ...valid, linkUrl: '  ' })).linkUrl).toBeNull()
  })
  it('refuses to pause a campaign in review', async () => {
    const c = await submitCampaign((await makeCampaign()).id)
    await expect(pauseCampaign(c.id)).rejects.toBe('INVALID_TRANSITION')
  })
  it('pauses and resumes a live campaign', async () => {
    const c = await makeCampaign()
    await db.campaign.update({ where: { id: c.id }, data: { status: 'live' } })
    expect((await pauseCampaign(c.id)).status).toBe('paused')
    expect((await resumeCampaign(c.id)).status).toBe('live')
    await expect(resumeCampaign(c.id)).rejects.toBe('INVALID_TRANSITION')
  })
  it('updates a draft but not a live campaign', async () => {
    const c = await makeCampaign()
    expect((await updateCampaign(c.id, { ...valid, name: 'New name' })).name).toBe('New name')
    await db.campaign.update({ where: { id: c.id }, data: { status: 'live' } })
    await expect(updateCampaign(c.id, valid)).rejects.toBe('INVALID_TRANSITION')
  })
})

describe('tileColor', () => {
  it('accepts only palette colours', () => {
    expect(campaignInput.safeParse({ ...valid, tileColor: '#FF5A1F' }).success).toBe(true)
    expect(campaignInput.safeParse({ ...valid, tileColor: '#123456' }).success).toBe(false)
  })
})
