import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { CampaignStatus, Prisma, Workspace } from '@prisma/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { editOfferAction, pause, previewOffers, resume, submitAction } from '@/app/app/(console)/campaigns/actions'
import EditOfferPage from '@/app/app/(console)/campaigns/[id]/edit/page'
import NewCampaignPage from '@/app/app/(console)/campaigns/new/page'
import { formProblem } from '@/components/campaign/form/problem'
import {
  campaignDefaults, newCampaignDefaults, offerInput, sameValues, toInput, type FormValues,
} from '@/components/campaign/form/values'
import { auth } from '@/lib/auth'
import type { CampaignInput } from '@/lib/campaigns'
import { db } from '@/lib/db'
import { clearDraft, draftKey, loadDraft, parseDraft, saveDraft, serialiseDraft, startOver } from '@/lib/draft-store'
import { tokens } from '@/lib/tokens'
import { resetDb } from '../../scripts/db-truncate'
import { expectCopySentence } from '../stubs/copy-sentence'

vi.mock('@/lib/auth', () => ({ auth: vi.fn(), signOut: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const jar = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => jar }))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

const DAY = 86_400_000
const lagosDay = (at: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(at)
const IMAGE_KEY = '0b6f2a8e-3c1d-4e5f-9a7b-1c2d3e4f5a6b.png'

// What the New campaign form sends for Kola Bright's defaults, filled in.
const input = (): CampaignInput => ({
  name: 'Easter bundle',
  brand: 'Kola Bright',
  country: 'NG',
  category: 'Food & drink',
  headline: 'Free 50cl with any 6-pack',
  description: 'Buy a 6-pack at any Shoprite and get a free 50cl bottle.',
  tileColor: tokens.tileColors[0],
  placement: 'card',
  redeemMethod: 'link',
  linkUrl: 'https://kolabright.example/easter',
  budgetUsd: 300,
  rewardLocal: 50,
  // Tomorrow in Lagos: the actions run on the real clock.
  startsAt: lagosDay(Date.now() + DAY),
  runsForDays: 14,
  termsAccepted: true,
})

type Role = 'Owner' | 'Manager' | 'Viewer' | 'Global'

let mine: Workspace
let theirs: Workspace

// Kola Bright (Nigeria, approved, $1,500 limit) and a rival, Phoenix card/featured rates for Nigeria and
// card for Kenya, FX for both; the actor is a member with `role`, or Global inside Kola Bright.
async function setup(role: Role, ws: Partial<Prisma.WorkspaceCreateInput> = {}) {
  const owner = await db.user.create({ data: { email: 'tunde@x.test', name: 'Tunde', passwordHash: 'x' } })
  mine = await db.workspace.create({
    data: { name: 'Kola Bright', type: 'Brand', country: 'NG', status: 'approved', creditLimitCents: 150_000, ...ws },
  })
  theirs = await db.workspace.create({ data: { name: 'Rival', type: 'Brand', country: 'NG', status: 'approved' } })
  await db.workspaceMember.create({ data: { userId: owner.id, workspaceId: mine.id, role: 'Owner' } })
  let actor = owner
  if (role !== 'Owner') {
    actor = await db.user.create({ data: { email: 'a@x.test', name: 'Ada', passwordHash: 'x', isGlobalAdmin: role === 'Global' } })
    if (role !== 'Global') await db.workspaceMember.create({ data: { userId: actor.id, workspaceId: mine.id, role } })
  }
  const phoenix = await db.channel.create({ data: { key: 'phoenix', name: 'Phoenix', apiKeyHash: 'x', isLive: true } })
  const from = new Date(Date.now() - 60 * DAY)
  await db.rateCard.createMany({
    data: [
      { channelId: phoenix.id, country: 'NG', placement: 'card', cpmCents: 120, effectiveFrom: from },
      { channelId: phoenix.id, country: 'NG', placement: 'featured', cpmCents: 220, effectiveFrom: from },
      { channelId: phoenix.id, country: 'KE', placement: 'card', cpmCents: 90, effectiveFrom: from },
    ],
  })
  await db.marketFx.createMany({
    data: [
      { country: 'NG', fxPerUsd: 1550, effectiveFrom: from },
      { country: 'KE', fxPerUsd: 129, effectiveFrom: from },
    ],
  })
  vi.mocked(auth).mockResolvedValue({ user: { id: actor.id, email: actor.email, name: actor.name }, expires: '2099-01-01' } as never)
  jar.get.mockImplementation((k: string) => (k === 'of_ws' ? { value: mine.id } : undefined))
  return { actor, owner, phoenix }
}

// A campaign in `status`, halfway through a 14-day flight.
const campaign = (workspaceId: string, status: CampaignStatus, data: Partial<Prisma.CampaignUncheckedCreateInput> = {}) =>
  db.campaign.create({
    data: {
      workspaceId, name: 'Buy 2 get 1', brand: 'Kola Bright', country: 'NG', category: 'Food & drink',
      headline: 'Buy 2 bottles, get 1 free', description: 'Show the code at any Kola Bright stand.',
      placement: 'card', redeemMethod: 'code', claimCode: 'KOLA2X1', budgetUsd: 300, shareRewardLabel: 'Earn ₦50 airtime',
      tileColor: tokens.tileColors[0], status, cpmCents: 120, fxPerUsd: 1550,
      startsAt: new Date(Date.now() - 7 * DAY), endsAt: new Date(Date.now() + 7 * DAY), ...data,
    },
  })

// The offer fields the form sends for a running campaign.
const offer = {
  brand: 'Kola Bright', category: 'Food & drink', headline: 'Buy 3 bottles, get 2 free',
  description: 'Show the code at any Kola Bright stand in Lagos.', tileColor: tokens.tileColors[1],
  creativeImageKey: IMAGE_KEY, placement: 'card', redeemMethod: 'code', termsAccepted: true,
}

const reload = (id: string) => db.campaign.findUniqueOrThrow({ where: { id } })

beforeEach(() => vi.clearAllMocks())

describe('a Viewer', () => {
  it('is refused submit, edit, pause and resume', async () => {
    await setup('Viewer')
    const live = await campaign(mine.id, 'live')
    await expect(submitAction(input())).rejects.toBe('FORBIDDEN')
    await expect(editOfferAction(live.id, offer)).rejects.toBe('FORBIDDEN')
    await expect(pause(live.id)).rejects.toBe('FORBIDDEN')
    await expect(resume(live.id)).rejects.toBe('FORBIDDEN')
    expect(await db.campaign.count()).toBe(1)
    expect((await reload(live.id)).status).toBe('live')
  })
})

describe('submitAction', () => {
  it('creates the campaign in review, priced at the current rate, and returns its id', async () => {
    await setup('Manager')
    const res = await submitAction(input())
    expect(res).toEqual({ id: expect.any(String) })
    const row = await reload((res as { id: string }).id)
    expect(row).toMatchObject({
      workspaceId: mine.id, status: 'review', name: 'Easter bundle', placement: 'card', cpmCents: 120, budgetUsd: 300,
      rewardLocal: 50, linkUrl: 'https://kolabright.example/easter', shareRewardLabel: 'Earn ₦50 airtime',
    })
    expect(Number(row.fxPerUsd)).toBe(1550)
    expect(await db.auditEvent.count()).toBe(0)
  })

  it('names the member who submitted it as its creator: the Owner, a Manager, or Global inside the workspace', async () => {
    for (const role of ['Owner', 'Manager', 'Global'] as const) {
      await resetDb()
      const { actor } = await setup(role)
      const res = (await submitAction(input())) as { id: string }
      const row = await db.campaign.findUniqueOrThrow({ where: { id: res.id }, include: { createdBy: { select: { name: true } } } })
      expect(row.createdById, role).toBe(actor.id)
      expect(row.createdBy?.name, role).toBe(actor.name)
    }
  })

  it('writes an audit row when Global submits inside the workspace', async () => {
    const { actor } = await setup('Global')
    const res = (await submitAction(input())) as { id: string }
    const rows = await db.auditEvent.findMany({ where: { action: 'campaign.submit' } })
    expect(rows).toEqual([expect.objectContaining({ actorId: actor.id, targetId: res.id, workspaceId: mine.id })])
  })

  it('refuses what the form refuses, in the same sentence: the form and the server judge one set of rules', async () => {
    await setup('Owner')
    const filled: FormValues = {
      ...newCampaignDefaults(mine), name: 'Easter bundle', headline: 'Free 50cl with any 6-pack',
      description: 'Buy a 6-pack at any Shoprite and get a free 50cl bottle.', linkUrl: 'https://kolabright.example/easter',
      termsAccepted: true,
    }
    const cases: Partial<FormValues>[] = [
      { name: '' }, { name: 'E' }, { headline: '' }, { description: '' }, { category: 'Betting' },
      { headline: 'Win the weekly draw' }, { linkUrl: '' }, { linkUrl: 'http://kolabright.example' }, { linkUrl: 'https://' },
      { linkUrl: 'https://kola bright.com' }, { placement: 'video' }, { budgetUsd: '' }, { budgetUsd: '49' },
      { budgetUsd: '55.5' }, { budgetUsd: '2000' }, { rewardLocal: '' }, { rewardLocal: '-5' }, { rewardLocal: '2.5' },
      { rewardLocal: '21474837' }, { startsAt: '' }, { startsAt: '2020-01-01' }, { runsFor: 'custom', endsAt: '' },
      { runsFor: 'custom', endsAt: '2020-01-01' }, { termsAccepted: false },
    ]
    for (const patch of cases) {
      const v = { ...filled, ...patch }
      const client = formProblem({
        values: v, isNew: true, stage: 'review', workspace: { type: 'Brand', declined: false },
        credit: { limitCents: 150_000, inUseCents: 0 }, cpmCents: 120, fxPerUsd: 1550,
      })
      expect(client, JSON.stringify(patch)).not.toBeNull()
      expect(await submitAction(toInput(v)), JSON.stringify(patch)).toEqual({ error: client!.message })
      // A sentence from the copy file, never zod's words.
      expectCopySentence(client!.message, JSON.stringify(patch))
    }
    expect(await db.campaign.count()).toBe(0)
    // And what the form lets through, the server takes.
    expect(formProblem({
      values: filled, isNew: true, stage: 'review', workspace: { type: 'Brand', declined: false },
      credit: { limitCents: 150_000, inUseCents: 0 }, cpmCents: 120, fxPerUsd: 1550,
    })).toBeNull()
    expect(await submitAction(toInput(filled))).toEqual({ id: expect.any(String) })
  })

  it("Edit offer on a running campaign: the revision is refused in the form's sentence, and what the form passes is taken", async () => {
    await setup('Owner')
    const live = await campaign(mine.id, 'live')
    const base: FormValues = { ...campaignDefaults(live, (key) => `/uploads/${key}`), termsAccepted: true }
    const edit = { running: true, heldCents: live.budgetUsd * 100 }
    const judge = (v: FormValues) =>
      formProblem({
        values: v, isNew: false, stage: 'edit', edit, workspace: { type: 'Brand', declined: false },
        credit: { limitCents: 150_000, inUseCents: 0 }, cpmCents: 120, fxPerUsd: 1550,
      })
    const cases: Partial<FormValues>[] = [
      { headline: '' }, { headline: 'h'.repeat(49) }, { description: '' }, { category: 'Betting' },
      { headline: 'Win the weekly draw' }, { redeemMethod: 'link', linkUrl: '' },
      { redeemMethod: 'link', linkUrl: 'http://kolabright.example' }, { redeemMethod: 'link', linkUrl: 'https://' },
      { placement: 'video' }, { termsAccepted: false },
    ]
    for (const patch of cases) {
      const v = { ...base, ...patch }
      const client = judge(v)
      expect(client, JSON.stringify(patch)).not.toBeNull()
      // The form sends the offer alone for a running campaign.
      expect(await editOfferAction(live.id, offerInput(v)), JSON.stringify(patch)).toEqual({ error: client!.message })
      expectCopySentence(client!.message, JSON.stringify(patch))
    }
    expect(await db.campaignRevision.count()).toBe(0)
    const ok = { ...base, headline: 'Buy 3 bottles, get 2 free' }
    expect(judge(ok)).toBeNull()
    expect(await editOfferAction(live.id, offerInput(ok))).toEqual({ revision: true })
  })

  it('answers a date that is not on the calendar with the validation message, without throwing', async () => {
    await setup('Owner')
    expect(await submitAction({ ...input(), startsAt: '2026-13-45' })).toEqual({ error: 'Pick a start date.' })
    expect(await submitAction({ ...input(), runsForDays: undefined, endsAt: '2026-02-30' })).toEqual({
      error: expect.any(String),
    })
    expect(await db.campaign.count()).toBe(0)
  })

  it('refuses a reward too large to store, and creates nothing', async () => {
    await setup('Owner')
    for (const rewardLocal of [21_474_837, 3_000_000_000]) {
      expect(await submitAction({ ...input(), rewardLocal })).toEqual({ error: 'That reward is too large.' })
    }
    expect(await db.campaign.count()).toBe(0)
  })

  it('re-runs the form rules on the server, the credit limit included', async () => {
    await setup('Owner', { creditLimitCents: 20_000 })
    expect(await submitAction({ ...input(), redeemMethod: 'link', linkUrl: 'http://kolabright.example' })).toEqual({
      error: 'Online offers need an https:// link.',
    })
    expect(await submitAction(input())).toEqual({
      error: 'Over your credit limit of $200 by $100. Pay an open invoice or ask Global to raise it.',
    })
    expect(await submitAction({ ...input(), startsAt: lagosDay(Date.now() - 3 * DAY) })).toEqual({
      error: "Start date can't be in the past.",
    })
    expect(await db.campaign.count()).toBe(0)
  })

  it('says when no rate is set for the placement, and leaves nothing behind', async () => {
    await setup('Owner')
    expect(await submitAction({ ...input(), placement: 'splash', creativeImageKey: IMAGE_KEY })).toEqual({
      error: 'No rate is set for this placement in Nigeria yet. Ask Global.',
    })
    expect(await db.campaign.count()).toBe(0)
  })

  it('says when no exchange rate is set for the market', async () => {
    await setup('Owner')
    await db.marketFx.deleteMany({ where: { country: 'NG' } })
    expect(await submitAction(input())).toEqual({ error: 'No exchange rate is set for Nigeria yet. Ask Global.' })
    expect(await db.campaign.count()).toBe(0)
  })

  it('refuses a creative that does not match the placement, crafted past the form', async () => {
    await setup('Owner')
    const video = '0b6f2a8e-3c1d-4e5f-9a7b-1c2d3e4f5a6b.mp4'
    expect(await submitAction({ ...input(), placement: 'card', creativeVideoKey: video })).toEqual({
      error: "The creative doesn't match the placement.",
    })
    expect(await submitAction({ ...input(), placement: 'splash', creativeImageKey: IMAGE_KEY, creativeVideoKey: video })).toEqual({
      error: "The creative doesn't match the placement.",
    })
    expect(await db.campaign.count()).toBe(0)
  })

  it('refuses a stored creative larger than the placement takes, crafted past the form', async () => {
    const { phoenix } = await setup('Owner')
    await db.rateCard.create({
      data: { channelId: phoenix.id, country: 'NG', placement: 'splash', cpmCents: 800, effectiveFrom: new Date(Date.now() - DAY) },
    })
    const before = process.env.UPLOAD_DIR
    const dir = await mkdtemp(path.join(tmpdir(), 'oshofree-cap-'))
    process.env.UPLOAD_DIR = dir
    try {
      // A 3 MB PNG: fine as a splash (4 MB), too large for a Wall card or a Featured tile (2 MB).
      const big = new Uint8Array(3 * 1024 * 1024)
      big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      await writeFile(path.join(dir, IMAGE_KEY), big)
      for (const placement of ['card', 'featured'] as const) {
        expect(await submitAction({ ...input(), placement, creativeImageKey: IMAGE_KEY })).toEqual({
          error: 'The creative is too large for this placement.',
        })
      }
      expect(await db.campaign.count()).toBe(0)
      const live = await campaign(mine.id, 'live')
      expect(await editOfferAction(live.id, offer)).toEqual({ error: 'The creative is too large for this placement.' })
      expect(await db.campaignRevision.count()).toBe(0)
      expect(await submitAction({ ...input(), placement: 'splash', creativeImageKey: IMAGE_KEY })).toEqual({ id: expect.any(String) })
    } finally {
      process.env.UPLOAD_DIR = before
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('keeps the brand a Brand workspace is named for', async () => {
    await setup('Owner')
    const res = (await submitAction({ ...input(), brand: 'Someone Else' })) as { id: string }
    expect((await reload(res.id)).brand).toBe('Kola Bright')
  })

  it('refuses a declined workspace', async () => {
    await setup('Owner', { status: 'declined', declineReason: 'Not a real brand' })
    expect(await submitAction(input())).toEqual({ error: "Your workspace was declined, so campaigns can't be submitted." })
    expect(await db.campaign.count()).toBe(0)
  })
})

describe('editOfferAction', () => {
  it('opens a revision for a live campaign, which keeps running', async () => {
    await setup('Owner')
    const live = await campaign(mine.id, 'live')
    expect(await editOfferAction(live.id, offer)).toEqual({ revision: true })
    expect(await reload(live.id)).toMatchObject({ status: 'live', headline: 'Buy 2 bottles, get 1 free', claimCode: 'KOLA2X1' })
    const rev = await db.campaignRevision.findFirstOrThrow({ where: { campaignId: live.id } })
    expect(rev.data).toMatchObject({ headline: 'Buy 3 bottles, get 2 free', creativeImageKey: IMAGE_KEY, claimCode: 'KOLA2X1' })
  })

  it('refuses money, timing, name or market for a running campaign', async () => {
    await setup('Owner')
    const live = await campaign(mine.id, 'live')
    await expect(editOfferAction(live.id, { ...offer, budgetUsd: 400 })).rejects.toBe('INVALID')
    await expect(editOfferAction(live.id, { ...offer, startsAt: '2026-12-01' })).rejects.toBe('INVALID')
    await expect(editOfferAction(live.id, { ...offer, country: 'KE' })).rejects.toBe('INVALID')
    expect(await db.campaignRevision.count()).toBe(0)
    expect((await reload(live.id)).budgetUsd).toBe(300)
  })

  it("judges a revision on its offer, whatever Change without review did to the money and timing", async () => {
    await setup('Owner')
    // $40 and a 120-day flight: both refused on a new campaign, neither the revision's business.
    const live = await campaign(mine.id, 'live', { budgetUsd: 40, endsAt: new Date(Date.now() + 113 * DAY) })
    expect(await editOfferAction(live.id, offer)).toEqual({ revision: true })
  })

  it('runs the offer rules for a revision', async () => {
    await setup('Owner')
    const live = await campaign(mine.id, 'live')
    expect(await editOfferAction(live.id, { ...offer, headline: 'Win the draw' })).toEqual({
      error: 'Betting and draw offers need a licence or approval number in the description.',
    })
    expect(await editOfferAction(live.id, { ...offer, termsAccepted: false })).toEqual({ error: 'Confirm the offer is genuine.' })
    expect(await db.campaignRevision.count()).toBe(0)
  })

  it('edits a rejected campaign in place, name and market too, and sends it to review', async () => {
    const { actor } = await setup('Global')
    const rejected = await campaign(mine.id, 'rejected', { rejectReasonCode: 'not_available' })
    const edit = { ...input(), name: 'Nairobi bundle', country: 'KE', headline: 'Free soda with any 6-pack' }
    expect(await editOfferAction(rejected.id, edit)).toEqual({ revision: false })
    const row = await reload(rejected.id)
    expect(row).toMatchObject({
      status: 'review', name: 'Nairobi bundle', country: 'KE', headline: 'Free soda with any 6-pack', cpmCents: 90,
      shareRewardLabel: 'Earn KSh50 airtime', claimCode: 'KOLA2X1',
    })
    expect(Number(row.fxPerUsd)).toBe(129)
    expect(await db.auditEvent.count({ where: { action: 'campaign.edit', actorId: actor.id } })).toBe(1)
  })

  it('refuses an in-place edit whose reward is too large to store, and changes nothing', async () => {
    await setup('Owner')
    const rejected = await campaign(mine.id, 'rejected', { rejectReasonCode: 'not_available', rewardLocal: 50 })
    expect(await editOfferAction(rejected.id, { ...input(), rewardLocal: 21_474_837 })).toEqual({ error: 'That reward is too large.' })
    expect(await reload(rejected.id)).toMatchObject({ status: 'rejected', rewardLocal: 50, name: 'Buy 2 get 1' })
  })

  it('counts only the budget increase of a campaign already in review', async () => {
    await setup('Owner', { creditLimitCents: 40_000 })
    const inReview = await campaign(mine.id, 'review')
    const edit = { ...input(), startsAt: lagosDay(Date.now() - 7 * DAY) }
    expect(await editOfferAction(inReview.id, { ...edit, budgetUsd: 350 })).toEqual({ revision: false })
    expect(await editOfferAction(inReview.id, { ...edit, budgetUsd: 450 })).toEqual({
      error: 'Over your credit limit of $400 by $50. Pay an open invoice or ask Global to raise it.',
    })
    expect((await reload(inReview.id)).budgetUsd).toBe(350)
  })

  it("leaves another workspace's campaign alone", async () => {
    await setup('Owner')
    const other = await campaign(theirs.id, 'live')
    expect(await editOfferAction(other.id, offer)).toEqual({ error: "That campaign isn't in this workspace, so nothing was changed." })
    expect(await db.campaignRevision.count()).toBe(0)
  })
})

describe('pause and resume', () => {
  it('pause and resume a live campaign; Global leaves an audit trail', async () => {
    const { actor } = await setup('Global')
    const live = await campaign(mine.id, 'live')
    expect(await pause(live.id)).toEqual({ ok: true })
    expect((await reload(live.id)).status).toBe('paused')
    expect(await resume(live.id)).toEqual({ ok: true })
    expect((await reload(live.id)).status).toBe('live')
    const actions = await db.auditEvent.findMany({ where: { actorId: actor.id }, orderBy: { at: 'asc' }, select: { action: true } })
    expect(actions.map((a) => a.action)).toEqual(['campaign.pause', 'campaign.resume'])
  })

  it("explains when a campaign can't change state", async () => {
    await setup('Manager')
    const draft = await campaign(mine.id, 'draft')
    expect(await pause(draft.id)).toEqual({ error: "That campaign can't change state right now." })
  })

  it('refuses to resume over the credit limit with the resume toast, and leaves it paused', async () => {
    await setup('Owner', { creditLimitCents: 1000 })
    const paused = await campaign(mine.id, 'paused', { pausedBy: 'credit' })
    expect(await resume(paused.id)).toEqual({
      error: "Can't resume — credit limit reached. Pay the open invoice or ask Global to raise the limit.",
    })
    expect((await reload(paused.id)).status).toBe('paused')
  })
})

describe('the pages', () => {
  it('New campaign: the prototype head, defaults, live CPMs, cost and the first hint', async () => {
    await setup('Owner')
    const html = renderToStaticMarkup(await NewCampaignPage({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('Kola Bright › <a href="/app">Campaigns</a> › <span>New campaign</span>')
    expect(html).toContain('<h1>New campaign</h1>')
    expect(html).toContain('One form. Your offer goes live on Phoenix once Global approves it — usually within a working day.')
    expect(html).toContain('$1.20 CPM')
    expect(html).toContain('$2.20 CPM')
    expect(html).toContain('<span class="big">—</span>')
    expect(html).toContain('<div class="b">Kola Bright · Nigeria · 14d</div><div class="row"><span>Link to your site</span></div>')
    expect(html).toContain('<b>200.0k</b><small>about 14.3k a day for 14 days · ~7.2k opens</small>')
    expect(html).toContain('<span>Share rewards (est. 428 × ₦50)</span><span>$14</span>')
    expect(html).toContain('<span><b>$300</b> · ₦465,000</span>')
    expect(html).toContain('$1,200 left')
    expect(html).toContain('Give the campaign a name.')
    // Pressable, so a press can take the cursor to the field to fix; aria-disabled says it cannot submit yet.
    const primary = /<button\b([^>]*)>Review before submitting<\/button>/.exec(html)?.[1] ?? ''
    for (const attr of ['class="btn p"', 'type="submit"', 'aria-disabled="true"', 'aria-describedby="cf-hint"']) expect(primary).toContain(attr)
    expect(primary).not.toMatch(/\bdisabled=""/)
    expect(html).toContain('— 0/48')
    expect(html).toContain('— NGN airtime per successful share')
    expect(html).not.toContain('Cancel')
    // Nothing to start over from on a fresh form.
    expect(html).not.toContain('Start over')
  })

  it('New campaign: one offer per campaign, said once; the edit step leads to the Review step, which asks for the confirmation', async () => {
    await setup('Owner')
    const html = renderToStaticMarkup(await NewCampaignPage({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('<div class="box"><p class="sub">One offer per campaign. Add another campaign for another offer.</p><div class="form">')
    expect(/<button\b([^>]*)>Review before submitting<\/button>/.exec(html)?.[1]).toContain('aria-disabled="true"')
    expect(html).not.toContain('Submit for review')
    // Nothing to save yet: a fresh form is the defaults.
    expect(html).toMatch(/<button class="btn g" type="button" disabled="">Save draft<\/button>/)
    // The confirmation is given on the Review step, not here.
    expect(html).not.toContain('type="checkbox"')
    expect(html).not.toContain('This offer is genuine')
    // The Cost box sits beside the edit step.
    expect(html).toContain('<h3>Cost</h3>')
  })

  it('New campaign: ?brand= prefills an agency client', async () => {
    await setup('Owner', { type: 'Agency', name: 'MediaSpec (agency)' })
    const html = renderToStaticMarkup(await NewCampaignPage({ searchParams: Promise.resolve({ brand: '777Bet', focus: 'brand' }) }))
    expect(html).toContain('Brand <small>— client</small>')
    expect(html).toContain('value="777Bet"')
    // The ?brand= prefill is the form's default, not a change.
    expect(html).not.toContain('Start over')
  })

  it('Edit offer on a live campaign: the edit head, Cancel, and money and timing locked', async () => {
    await setup('Owner')
    const live = await campaign(mine.id, 'live')
    const html = renderToStaticMarkup(await EditOfferPage({ params: Promise.resolve({ id: live.id }) }))
    expect(html).toContain('<span>Edit offer</span>')
    expect(html).toContain('<h1>Edit offer</h1>')
    expect(html).toContain('Saving sends it back to review. The current version keeps running meanwhile.')
    expect(html).toContain('Save and resubmit')
    expect(html).toContain('<button class="btn g" type="button">Cancel</button>')
    expect(html).toContain('Change these without review on the campaign page.')
    expect(html).toMatch(/<input [^>]*type="number"[^>]*disabled=""[^>]*value="300"/)
    expect(html).toContain('value="Buy 2 get 1"')
    expect(html).not.toMatch(/type="checkbox"[^>]*checked=""/)
    // Edit offer is one page: its confirmation is on it, and there is no Review step, draft or one-offer line.
    expect(html).toContain('This offer is genuine, available in the country and dates above, and the brand will honour it.')
    for (const absent of ['Review before submitting', 'Save draft', 'One offer per campaign']) expect(html).not.toContain(absent)
  })
})

describe('draft store', () => {
  const values = (): FormValues => ({
    ...newCampaignDefaults({ name: 'Kola Bright', type: 'Brand', country: 'NG' }, new Date('2026-11-13T09:00:00Z')),
    name: 'Easter bundle',
    headline: 'Free 50cl',
    placement: 'video',
    creative: { key: '0b6f2a8e-3c1d-4e5f-9a7b-1c2d3e4f5a6b.mp4', kind: 'video', url: '/uploads/0b6f2a8e-3c1d-4e5f-9a7b-1c2d3e4f5a6b.mp4' },
    runsFor: 'custom',
    endsAt: '2026-12-01',
    budgetUsd: '450',
  })
  const defaults = () => newCampaignDefaults({ name: 'Kola Bright', type: 'Brand', country: 'NG' }, new Date('2026-11-14T09:00:00Z'))

  it('keys the draft by workspace', () => expect(draftKey('ws1')).toBe('of-draft:ws1'))

  it('round-trips the form values', () => {
    const v = values()
    expect(parseDraft(serialiseDraft('ws1', v), 'ws1', defaults())).toEqual(v)
  })

  it('never restores the confirmation', () => {
    const v = { ...values(), termsAccepted: true }
    expect(parseDraft(serialiseDraft('ws1', v), 'ws1', defaults())?.termsAccepted).toBe(false)
  })

  it("ignores another workspace's draft and anything unreadable", () => {
    expect(parseDraft(serialiseDraft('ws1', values()), 'ws2', defaults())).toBeNull()
    expect(parseDraft('not json', 'ws1', defaults())).toBeNull()
    expect(parseDraft(null, 'ws1', defaults())).toBeNull()
    expect(parseDraft(JSON.stringify({ workspaceId: 'ws1', values: 7 }), 'ws1', defaults())).toBeNull()
  })

  it('drops a stored creative the stored placement cannot take', () => {
    const image = { key: IMAGE_KEY, kind: 'image', url: `/uploads/${IMAGE_KEY}` } as const
    const raw = serialiseDraft('ws1', { ...values(), placement: 'video', creative: image })
    expect(parseDraft(raw, 'ws1', defaults())).toMatchObject({ placement: 'video', creative: null })
  })

  it('compares form values field by field', () => {
    expect(sameValues(defaults(), defaults())).toBe(true)
    expect(sameValues({ ...defaults(), name: 'E' }, defaults())).toBe(false)
    expect(sameValues({ ...defaults(), creative: values().creative }, defaults())).toBe(false)
  })

  it('keeps the fields that still make sense and takes defaults for the rest', () => {
    const raw = JSON.stringify({
      workspaceId: 'ws1',
      values: { ...values(), country: 'GB', placement: 'billboard', tileColor: 'red', budgetUsd: 450, creative: { key: '../x', kind: 'image', url: '/x' } },
    })
    const d = defaults()
    expect(parseDraft(raw, 'ws1', d)).toMatchObject({
      name: 'Easter bundle', country: d.country, placement: d.placement, tileColor: d.tileColor, budgetUsd: d.budgetUsd, creative: null,
    })
  })
})

describe('draft store in the browser', () => {
  const memory = () => {
    const m = new Map<string, string>()
    return {
      get length() { return m.size },
      key: (i: number) => [...m.keys()][i] ?? null,
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    }
  }
  const defaults = () => newCampaignDefaults({ name: 'Kola Bright', type: 'Brand', country: 'NG' }, new Date('2026-11-14T09:00:00Z'))

  it('saves, restores and clears; opening another workspace drops the old draft', () => {
    const storage = memory()
    vi.stubGlobal('window', { localStorage: storage })
    try {
      saveDraft('ws1', { ...defaults(), name: 'Easter bundle' })
      expect(loadDraft('ws1', defaults())?.name).toBe('Easter bundle')
      expect(loadDraft('ws2', defaults())).toBeNull()
      expect(storage.getItem('of-draft:ws1')).toBeNull()
      saveDraft('ws2', { ...defaults(), name: 'Pesa promo' })
      clearDraft('ws2')
      expect(loadDraft('ws2', defaults())).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('Start over clears the stored draft and hands back the defaults', () => {
    const storage = memory()
    vi.stubGlobal('window', { localStorage: storage })
    try {
      const d = { ...defaults(), brand: '777Bet' } // an agency's ?brand= prefill is part of the defaults
      saveDraft('ws1', { ...d, name: 'Half done', placement: 'featured' })
      expect(startOver('ws1', d)).toEqual(d)
      expect(storage.getItem('of-draft:ws1')).toBeNull()
      expect(loadDraft('ws1', d)).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('is a no-op without storage', () => {
    expect(() => saveDraft('ws1', defaults())).not.toThrow()
    expect(loadDraft('ws1', defaults())).toBeNull()
  })
})

describe('previewOffers', () => {
  const live = (workspaceId: string, country: 'NG' | 'KE', headline: string) =>
    db.campaign.create({
      data: {
        workspaceId, name: headline, brand: 'Rival', country, category: 'Retail', headline, description: 'Real.',
        placement: 'card', redeemMethod: 'code', claimCode: 'R1', budgetUsd: 50, status: 'live', shareRewardLabel: 'Airtime',
        startsAt: new Date(Date.now() - DAY), endsAt: new Date(Date.now() + DAY),
      },
    })

  beforeEach(async () => {
    await setup('Viewer')
    await live(theirs.id, 'NG', 'Lagos offer')
    await live(theirs.id, 'KE', 'Nairobi offer')
  })

  it("a Viewer lists the offers Phoenix would pull in that country, any workspace's", async () => {
    expect((await previewOffers('NG')).map((o) => o.headline)).toEqual(['Lagos offer'])
  })

  it('ignores a Phoenix channel that is not live', async () => {
    await db.channel.updateMany({ data: { isLive: false } })
    expect(await previewOffers('NG')).toEqual([])
  })

  it('hands the browser card fields only, never a claim code or link', async () => {
    const [o] = await previewOffers('NG')
    expect(Object.keys(o).sort()).toEqual(['ageGated', 'brand', 'category', 'creative', 'headline', 'id', 'placement'])
    expect(JSON.stringify(o)).not.toContain('R1')
  })

  it('answers an empty list for a country outside the five markets', async () => {
    expect(await previewOffers('GB')).toEqual([])
    expect(await previewOffers(undefined)).toEqual([])
  })
})
