import type { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  approveCampaignAction, approveRevisionAction, approveWorkspaceAction, declineWorkspaceAction, rejectCampaignAction,
  rejectRevisionAction,
} from '@/app/admin/review/actions'
import { auth } from '@/lib/auth'
import { editOffer, type OfferFields } from '@/lib/campaigns'
import { db } from '@/lib/db'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`)
  },
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
}))

// ---- Review (GLB §2.1, spec §6.4): every decision is Global's, answers with its toast and refreshes the badges ----

const DAY = 86_400_000

async function reviewWorld(isGlobalAdmin: boolean, wsStatus: 'pending' | 'approved' | 'declined' = 'approved') {
  const actor = await db.user.create({ data: { email: 'gl@x.test', name: 'GL', passwordHash: 'x', isGlobalAdmin } })
  vi.mocked(auth).mockResolvedValue({ user: { id: actor.id, isGlobalAdmin }, expires: '' } as never)
  const ws = await db.workspace.create({ data: { name: 'SunFresh Juices', type: 'Brand', country: 'GH', status: wsStatus } })
  const owner = await db.user.create({ data: { email: 'kofi@x.test', name: 'Kofi Mensah', passwordHash: 'x' } })
  await db.workspaceMember.create({ data: { userId: owner.id, workspaceId: ws.id, role: 'Owner' } })
  return { actor, ws, owner }
}

// A campaign in review on the real clock: started yesterday, ends in ten days.
const inReview = (workspaceId: string, over: Partial<Prisma.CampaignUncheckedCreateInput> = {}) =>
  db.campaign.create({
    data: {
      workspaceId, name: 'Juice', brand: 'SunFresh Juices', country: 'GH', category: 'Food & drink', headline: 'Free 33cl with any 1L',
      description: 'Show your claim code at the till.', placement: 'card', redeemMethod: 'code', claimCode: 'SUN', budgetUsd: 300,
      startsAt: new Date(Date.now() - DAY), endsAt: new Date(Date.now() + 10 * DAY), rewardLocal: 50, shareRewardLabel: 'Earn GH₵50 airtime',
      status: 'review', submittedAt: new Date(), ...over,
    },
  })

const statusOf = async (id: string) => (await db.campaign.findUniqueOrThrow({ where: { id } })).status

describe('review actions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('refuses a non-admin on every action and changes nothing', async () => {
    const { ws } = await reviewWorld(false, 'pending')
    const c = await inReview(ws.id)
    const calls = [
      () => approveWorkspaceAction(ws.id),
      () => declineWorkspaceAction(ws.id, 'No'),
      () => approveCampaignAction(c.id),
      () => rejectCampaignAction(c.id, 'broken_link', 'No'),
      () => approveRevisionAction('rev'),
      () => rejectRevisionAction('rev', 'broken_link', 'No'),
    ]
    for (const call of calls) await expect(call()).rejects.toThrow('NOT_FOUND')
    expect((await db.workspace.findUniqueOrThrow({ where: { id: ws.id } })).status).toBe('pending')
    expect(await statusOf(c.id)).toBe('review')
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('approves a campaign, says the advertiser was emailed and refreshes every layout', async () => {
    const { ws } = await reviewWorld(true)
    const c = await inReview(ws.id)
    expect(await approveCampaignAction(c.id)).toEqual({ ok: true, toast: 'Approved — advertiser emailed' })
    expect(await statusOf(c.id)).toBe('live')
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  for (const status of ['pending', 'declined'] as const) {
    it(`turns WORKSPACE_NOT_APPROVED into "Approve the workspace first." for a ${status} workspace`, async () => {
      const { ws } = await reviewWorld(true, status)
      const c = await inReview(ws.id)
      expect(await approveCampaignAction(c.id)).toEqual({ error: 'Approve the workspace first.' })
      expect(await statusOf(c.id)).toBe('review')
      expect(revalidatePath).not.toHaveBeenCalled()
    })
  }

  it('turns FLIGHT_ENDED into the pick-new-dates toast', async () => {
    const { ws } = await reviewWorld(true)
    const c = await inReview(ws.id, { startsAt: new Date(Date.now() - 10 * DAY), endsAt: new Date(Date.now() - DAY) })
    expect(await approveCampaignAction(c.id)).toEqual({
      error: 'The flight has already ended — the advertiser must pick new dates.',
    })
    expect(await statusOf(c.id)).toBe('review')
  })

  it('refuses a reject without a reason code, or with one that is not on the list', async () => {
    const { ws } = await reviewWorld(true)
    const c = await inReview(ws.id)
    for (const code of ['', 'nope', 'toString', undefined])
      expect(await rejectCampaignAction(c.id, code, 'Terms unclear')).toEqual({
        error: 'Give a reason so the advertiser knows what to fix.',
      })
    expect(await statusOf(c.id)).toBe('review')
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('rejects with a code and a note, and says the advertiser was told why', async () => {
    const { ws, owner } = await reviewWorld(true)
    const c = await inReview(ws.id)
    expect(await rejectCampaignAction(c.id, 'not_available', '  Not sold in Ghana yet. ')).toEqual({
      ok: true, toast: 'Rejected — advertiser emailed with the reason',
    })
    expect(await db.campaign.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({
      status: 'rejected', rejectReasonCode: 'not_available', rejectReason: 'Not sold in Ghana yet.',
    })
    const told = await db.notification.findFirstOrThrow({ where: { userId: owner.id } })
    expect(told).toMatchObject({ title: 'Juice was not approved', detail: 'Not available in market: Not sold in Ghana yet.' })
  })

  it('rejects with a code and no note', async () => {
    const { ws } = await reviewWorld(true)
    const c = await inReview(ws.id)
    expect(await rejectCampaignAction(c.id, 'creative_standards', '')).toMatchObject({ ok: true })
    expect(await db.campaign.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({
      rejectReasonCode: 'creative_standards', rejectReason: null,
    })
  })

  it('says someone already decided a campaign that is no longer in review', async () => {
    const { ws } = await reviewWorld(true)
    const c = await inReview(ws.id)
    await approveCampaignAction(c.id)
    expect(await rejectCampaignAction(c.id, 'broken_link', '')).toEqual({
      error: 'Someone already decided this. Reload to see where it stands.',
    })
  })

  it('approves a workspace, toasts "{name} approved — owner emailed" and tells the owner', async () => {
    const { ws, owner } = await reviewWorld(true, 'pending')
    expect(await approveWorkspaceAction(ws.id)).toEqual({ ok: true, toast: 'SunFresh Juices approved — owner emailed' })
    expect((await db.workspace.findUniqueOrThrow({ where: { id: ws.id } })).status).toBe('approved')
    expect(await db.notification.findFirstOrThrow({ where: { userId: owner.id } })).toMatchObject({
      title: 'Your workspace is approved', detail: 'Submit campaigns any time',
    })
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('declines a workspace only with a reason, toasts "{name} declined" and tells the owner why', async () => {
    const { ws, owner } = await reviewWorld(true, 'pending')
    expect(await declineWorkspaceAction(ws.id, '   ')).toEqual({ error: 'Give a reason so the advertiser knows what to fix.' })
    expect((await db.workspace.findUniqueOrThrow({ where: { id: ws.id } })).status).toBe('pending')
    expect(await declineWorkspaceAction(ws.id, 'Not a registered business')).toEqual({ ok: true, toast: 'SunFresh Juices declined' })
    expect(await db.workspace.findUniqueOrThrow({ where: { id: ws.id } })).toMatchObject({
      status: 'declined', declineReason: 'Not a registered business',
    })
    expect(await db.notification.findFirstOrThrow({ where: { userId: owner.id } })).toMatchObject({
      title: 'Your workspace was declined', detail: 'Not a registered business',
    })
  })

  describe('a revised offer', () => {
    async function withRevision() {
      const world = await reviewWorld(true)
      const c = await inReview(world.ws.id, { status: 'live' })
      const offer: OfferFields = {
        brand: c.brand, category: c.category, headline: 'Free 50cl with any 1L', description: c.description, tileColor: '',
        placement: c.placement, redeemMethod: 'code', claimCode: 'SUN', ageGated: false,
      }
      const { revision } = await editOffer(c.id, world.owner.id, offer)
      return { ...world, c, revision: revision! }
    }

    it('Approve applies the revision to the live campaign', async () => {
      const { c, revision } = await withRevision()
      expect(await approveRevisionAction(revision.id)).toEqual({ ok: true, toast: 'Approved — advertiser emailed' })
      expect(await db.campaign.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({
        status: 'live', headline: 'Free 50cl with any 1L',
      })
      expect((await db.campaignRevision.findUniqueOrThrow({ where: { id: revision.id } })).status).toBe('applied')
    })

    it('Reject needs a code and leaves the campaign as it was', async () => {
      const { c, revision } = await withRevision()
      expect(await rejectRevisionAction(revision.id, '', 'x')).toEqual({ error: 'Give a reason so the advertiser knows what to fix.' })
      expect(await rejectRevisionAction(revision.id, 'misleading_terms', 'Say which stores.')).toEqual({
        ok: true, toast: 'Rejected — advertiser emailed with the reason',
      })
      expect(await db.campaignRevision.findUniqueOrThrow({ where: { id: revision.id } })).toMatchObject({
        status: 'rejected', rejectReasonCode: 'misleading_terms', rejectReason: 'Say which stores.',
      })
      expect((await db.campaign.findUniqueOrThrow({ where: { id: c.id } })).headline).toBe('Free 33cl with any 1L')
    })

    it('Approve is refused while the workspace is not approved', async () => {
      const { ws, revision } = await withRevision()
      await db.workspace.update({ where: { id: ws.id }, data: { status: 'declined' } })
      expect(await approveRevisionAction(revision.id)).toEqual({ error: 'Approve the workspace first.' })
    })
  })
})
