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
import { CAMPAIGN } from '@/lib/copy-campaign'
import { MONEY } from '@/lib/copy-money'
import { resetDb } from '../../scripts/db-truncate'

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

const NOW = new Date('2026-11-14T09:00:00Z')
const DAY = 86_400_000

// Acme (Nigeria, $500 default limit) with one Owner and Global, plus Phoenix's card rate and the naira FX.
async function world(opts: { rates?: boolean; limitCents?: number } = {}) {
  const admin = await db.user.create({ data: { email: 'global@x.test', name: 'Global', passwordHash: 'x', isGlobalAdmin: true } })
  const owner = await db.user.create({ data: { email: 'owner@x.test', name: 'Owner', passwordHash: 'x' } })
  const ws = await db.workspace.create({
    data: {
      name: 'Acme', type: 'Brand', country: 'NG', creditLimitCents: opts.limitCents,
      members: { create: { userId: owner.id, role: 'Owner' } },
    },
  })
  if (opts.rates !== false) {
    const phoenix = await db.channel.create({ data: { key: 'phoenix', name: 'Phoenix Browser', apiKeyHash: 'x', isLive: true } })
    const from = new Date(NOW.getTime() - 30 * DAY)
    await db.rateCard.create({ data: { channelId: phoenix.id, country: 'NG', placement: 'card', cpmCents: 120, effectiveFrom: from } })
    await db.marketFx.create({ data: { country: 'NG', fxPerUsd: 1550, effectiveFrom: from } })
  }
  return { admin, owner, ws }
}

async function makeCampaign() {
  const { owner, ws } = await world()
  return { ...(await createCampaign(ws.id, valid)), ownerId: owner.id }
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
    const s = await submitCampaign(c.id, c.ownerId)
    expect(s.status).toBe('review')
    expect(s.submittedAt).not.toBeNull()
  })
  it('clears the reject reason when a rejected campaign is resubmitted', async () => {
    const c = await makeCampaign()
    await db.campaign.update({
      where: { id: c.id }, data: { status: 'rejected', rejectReasonCode: 'creative_standards', rejectReason: 'Blurry' },
    })
    const s = await submitCampaign(c.id, c.ownerId)
    expect(s).toMatchObject({ status: 'review', rejectReasonCode: null, rejectReason: null })
  })
  it('refuses to submit a campaign already in review and leaves the row unchanged', async () => {
    const c = await makeCampaign()
    const first = await submitCampaign(c.id, c.ownerId)
    await expect(submitCampaign(first.id, c.ownerId)).rejects.toBe('INVALID_TRANSITION')
    const after = await db.campaign.findUniqueOrThrow({ where: { id: first.id } })
    expect(after.status).toBe('review')
    expect(after.submittedAt).toEqual(first.submittedAt)
  })
  it('stores an empty link as null', async () => {
    const ws = await db.workspace.create({ data: { name: 'Acme', type: 'Brand', country: 'NG' } })
    expect((await createCampaign(ws.id, { ...valid, linkUrl: '  ' })).linkUrl).toBeNull()
  })
  it('refuses to pause a campaign in review', async () => {
    const c = await makeCampaign()
    await submitCampaign(c.id, c.ownerId)
    await expect(pauseCampaign(c.id, c.ownerId)).rejects.toBe('INVALID_TRANSITION')
  })
  it('pauses and resumes a live campaign', async () => {
    const c = await makeCampaign()
    await db.campaign.update({ where: { id: c.id }, data: { status: 'live', startsAt: new Date(Date.now() - DAY) } })
    expect((await pauseCampaign(c.id, c.ownerId)).status).toBe('paused')
    expect((await resumeCampaign(c.id, c.ownerId)).status).toBe('live')
    await expect(resumeCampaign(c.id, c.ownerId)).rejects.toBe('INVALID_TRANSITION')
  })
  it('updates a draft but not a live campaign', async () => {
    const c = await makeCampaign()
    expect((await updateCampaign(c.id, { ...valid, name: 'New name' })).name).toBe('New name')
    await db.campaign.update({ where: { id: c.id }, data: { status: 'live' } })
    await expect(updateCampaign(c.id, valid)).rejects.toBe('INVALID_TRANSITION')
  })
})

describe('submitCampaign', () => {
  it('snapshots the Phoenix CPM and the market FX at submission', async () => {
    const c = await makeCampaign()
    const s = await submitCampaign(c.id, c.ownerId, NOW)
    expect(s).toMatchObject({ status: 'review', submittedAt: NOW, cpmCents: 120 })
    expect(Number(s.fxPerUsd)).toBe(1550)
  })

  it('tells the workspace it is in review and Global that it needs review', async () => {
    const { admin, owner, ws } = await world()
    const c = await createCampaign(ws.id, valid)
    await submitCampaign(c.id, owner.id, NOW)
    const pick = { kind: true, title: true, detail: true, href: true } as const
    expect(await db.notification.findMany({ where: { userId: owner.id }, select: pick })).toEqual([
      { kind: 'review', title: 'Harmattan Sale is in review', detail: 'Global usually decides within one working day', href: `/app/campaigns/${c.id}` },
    ])
    expect(await db.notification.findMany({ where: { userId: admin.id }, select: pick })).toEqual([
      { kind: 'review', title: 'Harmattan Sale needs review', detail: 'Acme', href: '/admin/review' },
    ])
    expect(CAMPAIGN.submitted).toBe('Submitted — Global reviews within one working day')
  })

  it('refuses when Phoenix has no rate for the market and placement, and leaves the draft', async () => {
    const { owner, ws } = await world({ rates: false })
    const c = await createCampaign(ws.id, valid)
    await expect(submitCampaign(c.id, owner.id, NOW)).rejects.toBe('NO_RATE')
    expect((await db.campaign.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('draft')
    expect(await db.notification.count()).toBe(0)
  })

  it('refuses a budget over the credit available, carrying the limit and the excess', async () => {
    const { owner, ws } = await world({ limitCents: 4000 })
    const c = await createCampaign(ws.id, valid)
    const refused = submitCampaign(c.id, owner.id, NOW)
    await expect(refused).rejects.toThrow('CREDIT_LIMIT')
    await expect(refused).rejects.toMatchObject({ limitCents: 4000, excessCents: 1000 })
    expect(MONEY.overCredit(4000, 1000)).toBe('Over your credit limit of $40 by $10. Pay an open invoice or ask Global to raise it.')
    expect((await db.campaign.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('draft')
  })

  it('counts the whole budget again when an ended campaign is resubmitted', async () => {
    // Limit $90; $40 already spent sits unbilled. Resubmitting the $50 campaign needs $50 more: $90 fits, $89 does not.
    for (const [limitCents, ok] of [[8900, false], [9000, true]] as const) {
      await resetDb()
      const { owner, ws } = await world({ limitCents })
      const c = await createCampaign(ws.id, valid)
      await db.campaign.update({ where: { id: c.id }, data: { status: 'ended', endedAt: NOW } })
      await db.ledgerEntry.create({
        data: { workspaceId: ws.id, campaignId: c.id, at: NOW, amountCents: -4000, description: 'delivery', kind: 'delivery' },
      })
      const run = submitCampaign(c.id, owner.id, NOW)
      if (ok) await expect(run).resolves.toMatchObject({ status: 'review', endedAt: null })
      else await expect(run).rejects.toThrow('CREDIT_LIMIT')
    }
  })

  it('submits only a draft, a rejected or an ended campaign', async () => {
    const c = await makeCampaign()
    for (const status of ['live', 'paused', 'scheduled'] as const) {
      await db.campaign.update({ where: { id: c.id }, data: { status } })
      await expect(submitCampaign(c.id, c.ownerId, NOW)).rejects.toBe('INVALID_TRANSITION')
    }
  })
})

describe('tileColor', () => {
  it('accepts only palette colours', () => {
    expect(campaignInput.safeParse({ ...valid, tileColor: '#FF5A1F' }).success).toBe(true)
    expect(campaignInput.safeParse({ ...valid, tileColor: '#123456' }).success).toBe(false)
  })
})
