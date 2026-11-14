import type { Prisma, WorkspaceStatus } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import {
  approveCampaign,
  approveRevision,
  campaignFacts,
  changeWithoutReview,
  editOffer,
  endCampaign,
  pauseCampaign,
  pendingRevision,
  rejectCampaign,
  rejectRevision,
  resumeCampaign,
  submitCampaign,
  type OfferFields,
} from '@/lib/campaigns'
import { CAMPAIGN, PACE, REJECT_REASONS } from '@/lib/copy-campaign'
import { creditSummary } from '@/lib/money'
import { tokens } from '@/lib/tokens'

const DAY = 86_400_000
const NOW = new Date('2026-11-14T09:00:00Z')
const days = (n: number) => new Date(NOW.getTime() + n * DAY)

// Kola Bright (Nigeria, approved, $1,500 limit) with one Owner, Global, and Phoenix rates and FX.
async function world(opts: { workspace?: WorkspaceStatus; limitCents?: number } = {}) {
  const admin = await db.user.create({ data: { email: 'global@x.test', name: 'Global', passwordHash: 'x', isGlobalAdmin: true } })
  const owner = await db.user.create({ data: { email: 'tunde@x.test', name: 'Tunde', passwordHash: 'x' } })
  const ws = await db.workspace.create({
    data: {
      name: 'Kola Bright', type: 'Brand', country: 'NG', status: opts.workspace ?? 'approved',
      creditLimitCents: opts.limitCents ?? 150000, members: { create: { userId: owner.id, role: 'Owner' } },
    },
  })
  const phoenix = await db.channel.create({ data: { key: 'phoenix', name: 'Phoenix Browser', apiKeyHash: 'x', isLive: true } })
  const from = days(-60)
  await db.rateCard.createMany({
    data: [
      { channelId: phoenix.id, country: 'NG', placement: 'card', cpmCents: 120, effectiveFrom: from },
      { channelId: phoenix.id, country: 'NG', placement: 'featured', cpmCents: 220, effectiveFrom: from },
    ],
  })
  await db.marketFx.create({ data: { country: 'NG', fxPerUsd: 1550, effectiveFrom: from } })
  return { admin, owner, ws, phoenix }
}

// A live campaign halfway through a 14-day flight, $300 budget, submitted at the card rate.
const campaign = (workspaceId: string, data: Partial<Prisma.CampaignUncheckedCreateInput> = {}) =>
  db.campaign.create({
    data: {
      workspaceId, name: 'Buy 2 get 1', brand: 'Kola Bright', country: 'NG', category: 'Food & drink',
      headline: 'Buy 2 bottles, get 1 free', description: 'Show the code at any Kola Bright stand.',
      placement: 'card', redeemMethod: 'code', claimCode: 'KOLA2X1', budgetUsd: 300, shareRewardLabel: 'Earn ₦50 airtime',
      status: 'live', cpmCents: 120, fxPerUsd: 1550, startsAt: days(-7), endsAt: days(7), ...data,
    },
  })

const spend = (workspaceId: string, campaignId: string, cents: number) =>
  db.ledgerEntry.create({
    data: { workspaceId, campaignId, at: NOW, amountCents: -cents, description: 'Buy 2 get 1 — delivery', kind: 'delivery' },
  })

const inbox = (userId: string) =>
  db.notification.findMany({
    where: { userId }, orderBy: { createdAt: 'asc' }, select: { kind: true, title: true, detail: true, href: true },
  })

const reload = (id: string) => db.campaign.findUniqueOrThrow({ where: { id } })

const offer: OfferFields = {
  brand: 'Kola Bright', category: 'Food & drink', headline: 'Buy 3 bottles, get 2 free',
  description: 'Show the code at any Kola Bright stand in Lagos.', tileColor: tokens.tileColors[1],
  creativeImageKey: '0b6f2a8e-3c1d-4e5f-9a7b-1c2d3e4f5a6b.png', placement: 'card', redeemMethod: 'code',
  claimCode: 'KOLA3X2', ageGated: false,
}

describe('approveCampaign', () => {
  it('schedules a campaign whose start is still ahead, records the decision and tells the workspace', async () => {
    const { admin, owner, ws } = await world()
    const c = await campaign(ws.id, { status: 'review', startsAt: new Date('2026-11-16T00:00:00Z'), endsAt: new Date('2026-11-30T00:00:00Z') })
    const approved = await approveCampaign(c.id, admin.id, NOW)
    expect(approved).toMatchObject({ status: 'scheduled', decidedAt: NOW })
    expect(await db.reviewAction.findMany({ where: { targetId: c.id } })).toMatchObject([
      { targetType: 'Campaign', action: 'Approve', byUserId: admin.id },
    ])
    expect(await db.auditEvent.findMany({ where: { targetId: c.id } })).toMatchObject([
      { actorId: admin.id, action: 'campaign.approve', workspaceId: ws.id, before: { status: 'review' }, after: { status: 'scheduled' } },
    ])
    expect(await inbox(owner.id)).toEqual([
      { kind: 'approved', title: 'Buy 2 get 1 is scheduled for 16 Nov', detail: null, href: `/app/campaigns/${c.id}` },
    ])
  })

  it('names the start day in the market, not in UTC', async () => {
    const { admin, owner, ws } = await world()
    // 23:00 UTC on 15 Nov is midnight on 16 Nov in Lagos.
    const c = await campaign(ws.id, { status: 'review', startsAt: new Date('2026-11-15T23:00:00Z'), endsAt: new Date('2026-11-29T23:00:00Z') })
    await approveCampaign(c.id, admin.id, NOW)
    expect((await inbox(owner.id))[0].title).toBe('Buy 2 get 1 is scheduled for 16 Nov')
  })

  it('puts a campaign whose start has come straight live, with its Phoenix link', async () => {
    const { admin, owner, ws } = await world()
    const c = await campaign(ws.id, { status: 'review' })
    expect((await approveCampaign(c.id, admin.id, NOW)).status).toBe('live')
    expect(await db.shareLink.count({ where: { campaignId: c.id, sharerType: 'Root' } })).toBe(1)
    expect(await inbox(owner.id)).toEqual([
      { kind: 'approved', title: 'Buy 2 get 1 is live on Phoenix', detail: null, href: `/app/campaigns/${c.id}` },
    ])
  })

  it('refuses while the workspace is pending and leaves the campaign in review', async () => {
    const { admin, ws } = await world({ workspace: 'pending' })
    const c = await campaign(ws.id, { status: 'review' })
    await expect(approveCampaign(c.id, admin.id, NOW)).rejects.toBe('WORKSPACE_NOT_APPROVED')
    expect((await reload(c.id)).status).toBe('review')
    expect(await db.reviewAction.count()).toBe(0)
  })

  it('refuses a campaign that is not in review and has no revised offer waiting', async () => {
    const { admin, ws } = await world()
    const c = await campaign(ws.id, { status: 'live' })
    await expect(approveCampaign(c.id, admin.id, NOW)).rejects.toBe('INVALID_TRANSITION')
  })

  it('leaves a revised offer to approveRevision and rejectRevision: a running campaign is not in review', async () => {
    const { admin, owner, ws } = await world()
    const c = await campaign(ws.id)
    const { revision } = await editOffer(c.id, owner.id, offer, NOW)
    await expect(approveCampaign(c.id, admin.id, NOW)).rejects.toBe('INVALID_TRANSITION')
    await expect(rejectCampaign(c.id, admin.id, 'creative_standards', '', NOW)).rejects.toBe('INVALID_TRANSITION')
    expect(await reload(c.id)).toMatchObject({ status: 'live', version: 1, headline: 'Buy 2 bottles, get 1 free' })
    expect((await pendingRevision(c.id))?.id).toBe(revision!.id)
  })

  it('refuses a campaign whose flight is already over', async () => {
    const { admin, ws } = await world()
    const c = await campaign(ws.id, { status: 'review', startsAt: days(-14), endsAt: NOW })
    await expect(approveCampaign(c.id, admin.id, NOW)).rejects.toBe('FLIGHT_ENDED')
    expect((await reload(c.id)).status).toBe('review')
    expect(await db.reviewAction.count()).toBe(0)
  })
})

describe('rejectCampaign', () => {
  it('stores the reason code and note, records the decision and tells the workspace "{label}: {note}"', async () => {
    const { admin, owner, ws } = await world()
    const c = await campaign(ws.id, { status: 'review' })
    const note = 'Terms unclear — say where the offer can be redeemed.'
    const r = await rejectCampaign(c.id, admin.id, 'misleading_terms', note, NOW)
    expect(r).toMatchObject({ status: 'rejected', rejectReasonCode: 'misleading_terms', rejectReason: note, decidedAt: NOW })
    expect(await db.reviewAction.findMany({ where: { targetId: c.id } })).toMatchObject([
      { action: 'Reject', reason: `misleading_terms: ${note}`, byUserId: admin.id },
    ])
    expect(await db.auditEvent.count({ where: { targetId: c.id, action: 'campaign.reject', actorId: admin.id } })).toBe(1)
    expect(await inbox(owner.id)).toEqual([
      {
        kind: 'approved', title: 'Buy 2 get 1 was not approved',
        detail: `Misleading or unclear terms: ${note}`, href: `/app/campaigns/${c.id}`,
      },
    ])
  })

  it('allows an empty note; the advertiser sees the label alone', async () => {
    const { admin, owner, ws } = await world()
    const c = await campaign(ws.id, { status: 'review' })
    const r = await rejectCampaign(c.id, admin.id, 'broken_link', '  ', NOW)
    expect(r).toMatchObject({ rejectReasonCode: 'broken_link', rejectReason: null })
    expect((await inbox(owner.id))[0].detail).toBe('Broken or unsafe link')
  })

  it('requires a known reason code', async () => {
    const { admin, ws } = await world()
    const c = await campaign(ws.id, { status: 'review' })
    await expect(rejectCampaign(c.id, admin.id, 'blurry' as never, 'x', NOW)).rejects.toBe('REASON_REQUIRED')
    expect((await reload(c.id)).status).toBe('review')
  })

  it('labels every reason code in the reviewer\'s words', () => {
    expect(Object.values(REJECT_REASONS)).toEqual([
      'Misleading or unclear terms', 'Not available in market', 'Broken or unsafe link', 'Prohibited category',
      'Missing licence or approval number', 'Creative standards',
    ])
  })
})

describe('pause and resume', () => {
  it('pause marks the advertiser as the reason; resume clears it and goes back live', async () => {
    const { owner, ws } = await world()
    const c = await campaign(ws.id)
    expect(await pauseCampaign(c.id, owner.id)).toMatchObject({ status: 'paused', pausedBy: 'user' })
    expect(await resumeCampaign(c.id, owner.id, NOW)).toMatchObject({ status: 'live', pausedBy: null })
    await expect(resumeCampaign(c.id, owner.id, NOW)).rejects.toBe('INVALID_TRANSITION')
  })

  it('refuses to resume while credit in use is over the limit, and leaves it paused', async () => {
    // $300 budget still counts while paused; the limit is $200.
    const { owner, ws } = await world({ limitCents: 20000 })
    const c = await campaign(ws.id, { status: 'paused', pausedBy: 'credit' })
    expect((await creditSummary(ws.id)).overLimit).toBe(true)
    const refused = resumeCampaign(c.id, owner.id, NOW)
    await expect(refused).rejects.toThrow('CREDIT_LIMIT')
    await expect(refused).rejects.toMatchObject({ limitCents: 20000, excessCents: 10000 })
    expect(await reload(c.id)).toMatchObject({ status: 'paused', pausedBy: 'credit' })
  })

  it('refuses to resume a flight that is already over', async () => {
    const { owner, ws } = await world()
    const c = await campaign(ws.id, { status: 'paused', pausedBy: 'user', startsAt: days(-14), endsAt: days(-1) })
    await expect(resumeCampaign(c.id, owner.id, NOW)).rejects.toBe('FLIGHT_ENDED')
    expect((await reload(c.id)).status).toBe('paused')
  })

  it('resumes to scheduled when the start is still ahead', async () => {
    const { owner, ws } = await world()
    const c = await campaign(ws.id, { status: 'paused', pausedBy: 'user', startsAt: days(2), endsAt: days(16) })
    expect((await resumeCampaign(c.id, owner.id, NOW)).status).toBe('scheduled')
  })

  it('pauses only a live campaign', async () => {
    const { owner, ws } = await world()
    const c = await campaign(ws.id, { status: 'review' })
    await expect(pauseCampaign(c.id, owner.id)).rejects.toBe('INVALID_TRANSITION')
  })
})

describe('endCampaign', () => {
  it('ends a live campaign now and releases budget − spend from credit', async () => {
    const { owner, ws } = await world()
    const c = await campaign(ws.id)
    await spend(ws.id, c.id, 8200)
    const before = await creditSummary(ws.id)
    const { campaign: ended, releasedCents } = await endCampaign(c.id, owner.id, NOW)
    expect(ended).toMatchObject({ status: 'ended', endedAt: NOW })
    expect(releasedCents).toBe(21800)
    expect(CAMPAIGN.ended(releasedCents)).toBe('Ended — $218 released')
    expect(before.inUseCents - (await creditSummary(ws.id)).inUseCents).toBe(21800)
  })

  it('ends a paused campaign too, and releases nothing once spend has passed the budget', async () => {
    const { owner, ws } = await world()
    const c = await campaign(ws.id, { status: 'paused', pausedBy: 'user', budgetUsd: 50 })
    await spend(ws.id, c.id, 5200)
    expect(await endCampaign(c.id, owner.id, NOW)).toMatchObject({ campaign: { status: 'ended', pausedBy: null }, releasedCents: 0 })
  })

  it('ends only live or paused campaigns', async () => {
    const { owner, ws } = await world()
    for (const status of ['review', 'scheduled', 'ended'] as const) {
      const c = await campaign(ws.id, { status })
      await expect(endCampaign(c.id, owner.id, NOW)).rejects.toBe('INVALID_TRANSITION')
    }
  })
})

describe('changeWithoutReview', () => {
  it('refuses a budget below what is already spent', async () => {
    const { owner, ws } = await world()
    const c = await campaign(ws.id)
    await spend(ws.id, c.id, 13300)
    await expect(changeWithoutReview(c.id, owner.id, { budgetUsd: 132 }, NOW)).rejects.toBe('BUDGET_BELOW_SPEND')
    expect((await changeWithoutReview(c.id, owner.id, { budgetUsd: 133 }, NOW)).budgetUsd).toBe(133)
  })

  it('refuses an increase that would take credit in use over the limit, naming the limit', async () => {
    // In use $300 of $500: +$250 is over, +$200 fits.
    const { owner, ws } = await world({ limitCents: 50000 })
    const c = await campaign(ws.id)
    const refused = changeWithoutReview(c.id, owner.id, { budgetUsd: 550 }, NOW)
    await expect(refused).rejects.toThrow('CREDIT_LIMIT')
    await expect(refused).rejects.toMatchObject({ limitCents: 50000, excessCents: 5000 })
    expect(CAMPAIGN.overCredit(50000)).toBe('That would exceed your credit limit of $500')
    expect((await changeWithoutReview(c.id, owner.id, { budgetUsd: 500 }, NOW)).budgetUsd).toBe(500)
  })

  it('applies budget, end date and reward at once and leaves the status alone', async () => {
    const { owner, ws } = await world({ limitCents: 1_000_000 })
    for (const status of ['live', 'paused', 'review', 'scheduled'] as const) {
      const c = await campaign(ws.id, { status })
      const changed = await changeWithoutReview(c.id, owner.id, { budgetUsd: 400, endsAt: days(10), rewardLocal: 100 }, NOW)
      expect(changed).toMatchObject({ status, budgetUsd: 400, endsAt: days(10), rewardLocal: 100 })
    }
  })

  it('refuses an end that is not after the start, or already past', async () => {
    const { owner, ws } = await world()
    const c = await campaign(ws.id)
    await expect(changeWithoutReview(c.id, owner.id, { endsAt: days(-7) }, NOW)).rejects.toBe('END_BEFORE_START')
    await expect(changeWithoutReview(c.id, owner.id, { endsAt: days(-1) }, NOW)).rejects.toBe('END_BEFORE_START')
  })

  it('refuses a budget past the largest credit limit, on a draft too (its budget is not held against credit)', async () => {
    const { owner, ws } = await world()
    const c = await campaign(ws.id, { status: 'draft' })
    // The credit limit's ceiling: 2,147,483,647 cents.
    for (const budgetUsd of [21_474_837, 3_000_000_000]) {
      await expect(changeWithoutReview(c.id, owner.id, { budgetUsd }, NOW)).rejects.toBe('TOO_LARGE')
    }
    expect((await db.campaign.findUniqueOrThrow({ where: { id: c.id } })).budgetUsd).toBe(300)
    expect((await changeWithoutReview(c.id, owner.id, { budgetUsd: 21_474_836 }, NOW)).budgetUsd).toBe(21_474_836)
  })

  it('refuses a negative reward', async () => {
    const { owner, ws } = await world()
    const c = await campaign(ws.id)
    await expect(changeWithoutReview(c.id, owner.id, { rewardLocal: -5 }, NOW)).rejects.toBe('INVALID')
  })

  it('is closed to ended and rejected campaigns', async () => {
    const { owner, ws } = await world()
    for (const status of ['ended', 'rejected'] as const) {
      const c = await campaign(ws.id, { status })
      await expect(changeWithoutReview(c.id, owner.id, { rewardLocal: 10 }, NOW)).rejects.toBe('INVALID_TRANSITION')
    }
  })
})

describe('editOffer', () => {
  it('on a live campaign saves a revision in review and keeps the live version running', async () => {
    const { admin, owner, ws } = await world()
    const c = await campaign(ws.id)
    const { campaign: after, revision } = await editOffer(c.id, owner.id, { ...offer, budgetUsd: 9999 } as OfferFields, NOW)
    expect(after).toMatchObject({ status: 'live', headline: 'Buy 2 bottles, get 1 free', version: 1, budgetUsd: 300 })
    expect(revision).toMatchObject({ campaignId: c.id, status: 'review' })
    expect(revision!.data).toEqual({
      brand: 'Kola Bright', category: 'Food & drink', headline: 'Buy 3 bottles, get 2 free',
      description: 'Show the code at any Kola Bright stand in Lagos.', tileColor: tokens.tileColors[1],
      creativeImageKey: offer.creativeImageKey, creativeVideoKey: null, placement: 'card', redeemMethod: 'code',
      claimCode: 'KOLA3X2', linkUrl: null, ageGated: false,
    })
    expect((await pendingRevision(c.id))?.id).toBe(revision!.id)
    expect(await inbox(owner.id)).toEqual([
      { kind: 'review', title: 'Buy 2 get 1 is in review', detail: 'Global usually decides within one working day', href: `/app/campaigns/${c.id}` },
    ])
    expect(await inbox(admin.id)).toEqual([
      { kind: 'review', title: 'Buy 2 get 1 needs review', detail: 'Kola Bright', href: '/admin/review' },
    ])
  })

  it('keeps one revision pending: a second edit replaces the first', async () => {
    const { owner, ws } = await world()
    const c = await campaign(ws.id, { status: 'paused', pausedBy: 'user' })
    const first = await editOffer(c.id, owner.id, offer, NOW)
    const second = await editOffer(c.id, owner.id, { ...offer, headline: 'Third time lucky' }, NOW)
    expect(second.revision!.id).toBe(first.revision!.id)
    expect(await db.campaignRevision.count()).toBe(1)
    expect(((await pendingRevision(c.id))!.data as { headline: string }).headline).toBe('Third time lucky')
  })

  it('applying the revision swaps the offer in, bumps the version and keeps the campaign live', async () => {
    const { admin, owner, ws } = await world()
    const c = await campaign(ws.id)
    const { revision } = await editOffer(c.id, owner.id, offer, NOW)
    const applied = await approveRevision(revision!.id, admin.id, NOW)
    expect(applied).toMatchObject({
      status: 'live', version: 2, headline: 'Buy 3 bottles, get 2 free', claimCode: 'KOLA3X2',
      creativeImageKey: offer.creativeImageKey, tileColor: tokens.tileColors[1], budgetUsd: 300, cpmCents: 120,
    })
    expect(await db.campaignRevision.findUniqueOrThrow({ where: { id: revision!.id } })).toMatchObject({ status: 'applied', decidedAt: NOW })
    expect(await pendingRevision(c.id)).toBeNull()
    expect(await db.reviewAction.count({ where: { targetId: c.id, action: 'Approve', byUserId: admin.id } })).toBe(1)
    expect(await db.auditEvent.count({ where: { action: 'campaign.revision.approve', actorId: admin.id } })).toBe(1)
    const titles = (await inbox(owner.id)).map((n) => n.title)
    expect(titles).toContain("Buy 2 get 1's revised offer is approved")
    expect(titles).not.toContain('Buy 2 get 1 is live on Phoenix')
  })

  it('a revision that changes the placement is priced when submitted and charged at that rate once applied', async () => {
    const { admin, owner, ws, phoenix } = await world()
    // Featured is $2.20 when the edit is made and $3.00 from tomorrow, before Global approves.
    await db.rateCard.create({ data: { channelId: phoenix.id, country: 'NG', placement: 'featured', cpmCents: 300, effectiveFrom: days(1) } })
    const c = await campaign(ws.id)
    const { revision } = await editOffer(c.id, owner.id, { ...offer, placement: 'featured' }, NOW)
    expect(revision).toMatchObject({ cpmCents: 220 })
    expect((await reload(c.id)).cpmCents).toBe(120)
    expect(await approveRevision(revision!.id, admin.id, days(2))).toMatchObject({ placement: 'featured', cpmCents: 220 })
  })

  it('a revision that keeps the placement keeps the campaign\'s submitted rate', async () => {
    const { admin, owner, ws } = await world()
    const c = await campaign(ws.id, { cpmCents: 100 })
    const { revision } = await editOffer(c.id, owner.id, offer, NOW)
    expect(revision).toMatchObject({ cpmCents: null })
    expect((await approveRevision(revision!.id, admin.id, NOW)).cpmCents).toBe(100)
  })

  it('refuses a revision to a placement Phoenix has no rate for', async () => {
    const { owner, ws } = await world()
    const c = await campaign(ws.id)
    await expect(editOffer(c.id, owner.id, { ...offer, placement: 'splash' }, NOW)).rejects.toBe('NO_RATE')
    expect(await db.campaignRevision.count()).toBe(0)
  })

  it('rejecting the revision leaves the campaign as it was and stores the decision on the revision', async () => {
    const { admin, owner, ws } = await world()
    const c = await campaign(ws.id)
    const { revision } = await editOffer(c.id, owner.id, offer, NOW)
    const rejected = await rejectRevision(revision!.id, admin.id, 'creative_standards', 'Logo is cropped.', NOW)
    expect(rejected).toMatchObject({ status: 'rejected', rejectReasonCode: 'creative_standards', rejectReason: 'Logo is cropped.', decidedAt: NOW })
    expect(await reload(c.id)).toMatchObject({ status: 'live', version: 1, headline: 'Buy 2 bottles, get 1 free', rejectReasonCode: null })
    expect(await db.reviewAction.count({ where: { targetId: c.id, action: 'Reject', reason: 'creative_standards: Logo is cropped.' } })).toBe(1)
    expect(await inbox(owner.id)).toContainEqual({
      kind: 'approved', title: "Buy 2 get 1's revised offer was not approved", detail: 'Creative standards: Logo is cropped.',
      href: `/app/campaigns/${c.id}`,
    })
    await expect(approveRevision(revision!.id, admin.id, NOW)).rejects.toBe('INVALID_TRANSITION')
  })

  it('on a rejected or ended campaign overwrites the offer and sends it back to review', async () => {
    const { admin, owner, ws } = await world()
    for (const status of ['rejected', 'ended'] as const) {
      const c = await campaign(ws.id, { status, rejectReasonCode: status === 'rejected' ? 'broken_link' : null, cpmCents: 90, fxPerUsd: 1400 })
      const { campaign: after, revision } = await editOffer(c.id, owner.id, offer, NOW)
      expect(revision).toBeNull()
      expect(after).toMatchObject({
        status: 'review', headline: 'Buy 3 bottles, get 2 free', submittedAt: NOW, rejectReasonCode: null, cpmCents: 120,
      })
      expect(Number(after.fxPerUsd)).toBe(1550)
    }
    expect(await db.campaignRevision.count()).toBe(0)
    expect((await inbox(admin.id)).map((n) => n.title)).toEqual(['Buy 2 get 1 needs review', 'Buy 2 get 1 needs review'])
  })

  it('a revision pending when the campaign ends goes with it, so a resubmission never picks it up', async () => {
    const { admin, owner, ws } = await world()
    const c = await campaign(ws.id)
    const { revision } = await editOffer(c.id, owner.id, offer, NOW)
    await endCampaign(c.id, owner.id, NOW)
    expect(await pendingRevision(c.id)).toBeNull()
    await submitCampaign(c.id, owner.id, NOW)
    expect(await approveCampaign(c.id, admin.id, NOW)).toMatchObject({ status: 'live', headline: 'Buy 2 bottles, get 1 free', version: 1 })
    await expect(approveCampaign(c.id, admin.id, NOW)).rejects.toBe('INVALID_TRANSITION')
    await expect(approveRevision(revision!.id, admin.id, NOW)).rejects.toBe('NOT_FOUND')
    expect((await reload(c.id)).headline).toBe('Buy 2 bottles, get 1 free')
  })

  it('every move to review deletes a revision left pending (a campaign the daily job ended)', async () => {
    const { owner, ws } = await world()
    const c = await campaign(ws.id)
    await editOffer(c.id, owner.id, offer, NOW)
    await db.campaign.update({ where: { id: c.id }, data: { status: 'ended', endedAt: NOW } })
    await submitCampaign(c.id, owner.id, NOW)
    expect(await pendingRevision(c.id)).toBeNull()
    expect(await db.campaignRevision.count()).toBe(0)
  })

  it('decides a revision only while the campaign is still running', async () => {
    const { admin, owner, ws } = await world()
    const c = await campaign(ws.id)
    const { revision } = await editOffer(c.id, owner.id, offer, NOW)
    await db.campaign.update({ where: { id: c.id }, data: { status: 'ended', endedAt: NOW } })
    await expect(approveRevision(revision!.id, admin.id, NOW)).rejects.toBe('INVALID_TRANSITION')
    await expect(rejectRevision(revision!.id, admin.id, 'creative_standards', '', NOW)).rejects.toBe('INVALID_TRANSITION')
    expect(await reload(c.id)).toMatchObject({ version: 1, headline: 'Buy 2 bottles, get 1 free' })
    expect((await pendingRevision(c.id))?.status).toBe('review')
  })

  it('never loses an edit made while Global approves: it is either applied or still waiting', async () => {
    const { admin, owner, ws } = await world()
    const c = await campaign(ws.id)
    const { revision } = await editOffer(c.id, owner.id, offer, NOW)
    await Promise.all([
      approveRevision(revision!.id, admin.id, NOW),
      editOffer(c.id, owner.id, { ...offer, headline: 'Late change' }, NOW),
    ])
    const live = await reload(c.id)
    const waiting = (await pendingRevision(c.id))?.data as { headline: string } | undefined
    expect([live.headline, waiting?.headline]).toContain('Late change')
    expect(live.version).toBe(2)
  })

  it('on an ended campaign takes new dates and budget with the offer, and goes back to review', async () => {
    const { admin, owner, ws } = await world()
    const c = await campaign(ws.id, { status: 'ended', startsAt: days(-30), endsAt: days(-16), endedAt: days(-16) })
    await spend(ws.id, c.id, 25000)
    await expect(submitCampaign(c.id, owner.id, NOW)).rejects.toBe('FLIGHT_ENDED')
    await expect(editOffer(c.id, owner.id, offer, NOW)).rejects.toBe('FLIGHT_ENDED')
    const edit = { ...offer, budgetUsd: 500, startsAt: days(2), endsAt: days(16), rewardLocal: 100 }
    const { campaign: after, revision } = await editOffer(c.id, owner.id, edit, NOW)
    expect(revision).toBeNull()
    expect(after).toMatchObject({
      status: 'review', headline: 'Buy 3 bottles, get 2 free', budgetUsd: 500, startsAt: days(2), endsAt: days(16),
      rewardLocal: 100, endedAt: null,
    })
    // Credit in use: $250 spent (unbilled) + the $250 still to spend.
    expect((await creditSummary(ws.id)).inUseCents).toBe(50000)
    expect((await approveCampaign(c.id, admin.id, NOW)).status).toBe('scheduled')
  })

  it('checks the new money and timing of an in-place edit', async () => {
    const { owner, ws } = await world({ limitCents: 30000 })
    const c = await campaign(ws.id, { status: 'ended', startsAt: days(-30), endsAt: days(-16) })
    await spend(ws.id, c.id, 25000)
    const edit = { ...offer, budgetUsd: 300, startsAt: days(2), endsAt: days(16), rewardLocal: 50 }
    await expect(editOffer(c.id, owner.id, { ...edit, endsAt: days(2) }, NOW)).rejects.toBe('END_BEFORE_START')
    await expect(editOffer(c.id, owner.id, { ...edit, budgetUsd: 200 }, NOW)).rejects.toBe('BUDGET_BELOW_SPEND')
    await expect(editOffer(c.id, owner.id, { ...offer, budgetUsd: 300 } as never, NOW)).rejects.toBe('INVALID')
    // $250 unbilled + $100 still to spend is over the $300 limit; $250 + $50 fits.
    await expect(editOffer(c.id, owner.id, { ...edit, budgetUsd: 350 }, NOW)).rejects.toMatchObject({ message: 'CREDIT_LIMIT', excessCents: 5000 })
    expect((await editOffer(c.id, owner.id, edit, NOW)).campaign.status).toBe('review')
  })
})

describe('campaignFacts', () => {
  // Halfway through the flight (elapsed = 0.5) with a $300 budget.
  const facts = async (workspaceId: string, spentCents: number, data: Partial<Prisma.CampaignUncheckedCreateInput> = {}) => {
    const c = await campaign(workspaceId, data)
    if (spentCents) await spend(workspaceId, c.id, spentCents)
    return campaignFacts(c.id, NOW)
  }

  it('is on pace when spend keeps up with the flight', async () => {
    const { ws } = await world()
    expect(await facts(ws.id, 15000)).toEqual({
      status: 'live', daysLeft: 7, spendCents: 15000, leftCents: 15000, spendPct: 50, pace: 1, paceNote: 'On pace.',
    })
  })

  it('is slow below 0.8 and fast above 1.2', async () => {
    const { ws } = await world()
    const slow = await facts(ws.id, 11700)
    expect(slow).toMatchObject({ pace: 0.78, paceNote: PACE.slow })
    expect(slow.paceNote).toBe('Delivering slower than planned — consider extending the flight.')
    expect(await facts(ws.id, 18300)).toMatchObject({ pace: 1.22, paceNote: 'Delivering faster than planned — budget will finish early.' })
  })

  it('treats the bands as exclusive: 0.8 and 1.2 are on pace', async () => {
    const { ws } = await world()
    expect((await facts(ws.id, 12000)).paceNote).toBe('On pace.')
    expect((await facts(ws.id, 18000)).paceNote).toBe('On pace.')
  })

  it('floors the elapsed fraction at 0.05, so a brand-new campaign with no delivery reads slow', async () => {
    const { ws } = await world()
    const f = await facts(ws.id, 0, { startsAt: NOW, endsAt: days(14) })
    expect(f).toMatchObject({ pace: 0, paceNote: 'Delivering slower than planned — consider extending the flight.', daysLeft: 14 })
  })

  it('notes paused and in-review campaigns, and says nothing for the rest', async () => {
    const { ws } = await world()
    expect((await facts(ws.id, 0, { status: 'paused', pausedBy: 'user' })).paceNote).toBe('Paused — not delivering. Resume any time.')
    expect((await facts(ws.id, 0, { status: 'review' })).paceNote).toBe('Global reviews within one working day.')
    for (const status of ['scheduled', 'ended', 'rejected', 'draft'] as const) {
      expect((await facts(ws.id, 0, { status })).paceNote).toBe('')
    }
  })
})

describe('copy', () => {
  it('carries the prototype\'s toasts verbatim', () => {
    expect(CAMPAIGN).toEqual({
      paused: 'Paused — leaves Phoenix within 15 minutes. Resume any time.',
      resumed: 'Resumed — back on Phoenix within 15 minutes.',
      resumeBlocked: "Can't resume — credit limit reached. Pay the open invoice or ask Global to raise the limit.",
      saved: 'Saved — live within 15 minutes, no review needed',
      budgetBelowSpend: "Budget can't be below what's already spent",
      overCredit: expect.any(Function),
      ended: expect.any(Function),
      submitted: 'Submitted — Global reviews within one working day',
      resubmitted: 'Resubmitted — Global reviews within one working day',
      approved: 'Approved — advertiser emailed',
      rejected: 'Rejected — advertiser emailed with the reason',
      endConfirm: 'End now? Unspent budget is released from your credit.',
    })
    expect(CAMPAIGN.overCredit(150000)).toBe('That would exceed your credit limit of $1,500')
    expect(CAMPAIGN.ended(21800)).toBe('Ended — $218 released')
  })
})
