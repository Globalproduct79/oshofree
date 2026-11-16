import type { Prisma, RejectReason, WorkspaceStatus } from '@prisma/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { previewOffersAction } from '@/app/admin/review/actions'
import ReviewPage from '@/app/admin/review/page'
import { runAndSay } from '@/components/demo/RunDailyJobButton'
import { say } from '@/components/platform/say'
import { takeToast } from '@/components/shell/toast-store'
import { auth } from '@/lib/auth'
import { localMidnight } from '@/lib/campaign-schema'
import {
  approveCampaign, approveRevision, createCampaign, editOffer, rejectCampaign, rejectRevision, submitCampaign,
  type CampaignInput, type OfferFields,
} from '@/lib/campaigns'
import { db } from '@/lib/db'
import { checkLink } from '@/lib/link-check'
import { generateCode } from '@/lib/links'
import { reviewQueue } from '@/lib/review'
import { navCounts } from '@/lib/shell'
import { tokens } from '@/lib/tokens'
import { approveWorkspace, declineWorkspace } from '@/lib/workspaces'

vi.mock('@/lib/auth', () => ({ auth: vi.fn(), signOut: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => '/admin/review',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

const input: CampaignInput = {
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
  tileColor: '#FF5A1F',
  rewardLocal: 50,
  termsAccepted: true,
}

// The input runs 1–15 Dec: submitted in November, approving after the 1st puts it straight live.
const SUBMITTED = new Date('2026-11-20T09:00:00Z')
const AFTER_START = new Date('2026-12-02T09:00:00Z')
const RATES_FROM = new Date('2026-01-01T00:00:00Z')

async function setup(wsStatus: 'pending' | 'approved' = 'approved') {
  const admin = await db.user.create({ data: { email: 'a@x.test', name: 'A', passwordHash: 'x', isGlobalAdmin: true } })
  const ws = await db.workspace.create({ data: { name: 'Acme', type: 'Brand', country: 'NG', status: wsStatus } })
  const phoenix = await db.channel.create({ data: { key: 'phoenix', name: 'Phoenix', apiKeyHash: 'h1', isLive: true } })
  await db.channel.create({ data: { key: 'other', name: 'Other', apiKeyHash: 'h2', isLive: false } })
  await db.rateCard.create({ data: { channelId: phoenix.id, country: 'NG', placement: 'card', cpmCents: 120, effectiveFrom: RATES_FROM } })
  await db.marketFx.create({ data: { country: 'NG', fxPerUsd: 1550, effectiveFrom: RATES_FROM } })
  const c = await submitCampaign((await createCampaign(ws.id, input, admin.id)).id, admin.id, SUBMITTED)
  return { admin, ws, c }
}

describe('generateCode', () => {
  it('is 8 Crockford characters and unique over 1,000 calls', () => {
    const codes = new Set(Array.from({ length: 1000 }, generateCode))
    expect(codes.size).toBe(1000)
    for (const c of codes) expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/)
  })
})

describe('approveCampaign', () => {
  it('goes live, mints one Root link per live channel and records the decision', async () => {
    const { admin, c } = await setup()
    const live = await approveCampaign(c.id, admin.id, AFTER_START)
    expect(live.status).toBe('live')
    expect(live.decidedAt).not.toBeNull()
    const links = await db.shareLink.findMany({ where: { campaignId: c.id } })
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({ depth: 0, sharerType: 'Root', parentId: null })
    const actions = await db.reviewAction.findMany({ where: { targetId: c.id } })
    expect(actions).toHaveLength(1)
    expect(actions[0]).toMatchObject({ targetType: 'Campaign', action: 'Approve', byUserId: admin.id })
  })
  it('does not mint a second link when approved twice', async () => {
    const { admin, c } = await setup()
    await approveCampaign(c.id, admin.id, AFTER_START)
    await expect(approveCampaign(c.id, admin.id, AFTER_START)).rejects.toBe('INVALID_TRANSITION')
    expect(await db.shareLink.count({ where: { campaignId: c.id } })).toBe(1)
    expect(await db.reviewAction.count({ where: { targetId: c.id } })).toBe(1)
  })
  it('refuses while the workspace is pending', async () => {
    const { admin, c } = await setup('pending')
    await expect(approveCampaign(c.id, admin.id, AFTER_START)).rejects.toBe('WORKSPACE_NOT_APPROVED')
    expect((await db.campaign.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('review')
  })
})

describe('atomic decisions', () => {
  it('leaves the campaign in review with no links when the audit row cannot be written', async () => {
    const { c } = await setup()
    await expect(approveCampaign(c.id, 'no-such-user', AFTER_START)).rejects.toBeDefined()
    expect((await db.campaign.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('review')
    expect(await db.shareLink.count({ where: { campaignId: c.id } })).toBe(0)
  })
  it('leaves a pending workspace pending when the audit row cannot be written', async () => {
    const { ws } = await setup('pending')
    await expect(approveWorkspace(ws.id, 'no-such-user')).rejects.toBeDefined()
    expect((await db.workspace.findUniqueOrThrow({ where: { id: ws.id } })).status).toBe('pending')
  })
})

describe('rejectCampaign', () => {
  it('stores the reason code and note and records the decision', async () => {
    const { admin, c } = await setup()
    const r = await rejectCampaign(c.id, admin.id, 'misleading_terms', '  Terms unclear  ')
    expect(r).toMatchObject({ status: 'rejected', rejectReasonCode: 'misleading_terms', rejectReason: 'Terms unclear' })
    expect(r.decidedAt).not.toBeNull()
    const reason = 'misleading_terms: Terms unclear'
    expect(await db.reviewAction.count({ where: { targetId: c.id, action: 'Reject', reason } })).toBe(1)
  })
  it('requires a reason code', async () => {
    const { admin, c } = await setup()
    await expect(rejectCampaign(c.id, admin.id, '' as RejectReason, 'Terms unclear')).rejects.toBe('REASON_REQUIRED')
  })
})

describe('workspace decisions', () => {
  // The workspace's Owner, so the decision has someone to tell.
  async function withOwner(status: 'pending' | 'approved' = 'pending') {
    const { admin, ws } = await setup(status)
    const owner = await db.user.create({ data: { email: 'o@x.test', name: 'Kofi Mensah', passwordHash: 'x' } })
    await db.workspaceMember.create({ data: { userId: owner.id, workspaceId: ws.id, role: 'Owner' } })
    const told = () => db.notification.findMany({ where: { userId: owner.id, workspaceId: ws.id }, select: { title: true, detail: true } })
    return { admin, ws, owner, told }
  }

  it('approves a pending workspace once', async () => {
    const { admin, ws } = await setup('pending')
    expect((await approveWorkspace(ws.id, admin.id)).status).toBe('approved')
    await expect(approveWorkspace(ws.id, admin.id)).rejects.toBe('INVALID_TRANSITION')
    expect(await db.reviewAction.count({ where: { targetId: ws.id, targetType: 'Workspace', action: 'Approve' } })).toBe(1)
  })
  it('declines with a reason', async () => {
    const { admin, ws } = await setup('pending')
    await expect(declineWorkspace(ws.id, admin.id, ' ')).rejects.toBe('REASON_REQUIRED')
    const d = await declineWorkspace(ws.id, admin.id, 'Not a real business')
    expect(d).toMatchObject({ status: 'declined', declineReason: 'Not a real business' })
    expect(await db.reviewAction.count({ where: { targetId: ws.id, action: 'Decline', reason: 'Not a real business' } })).toBe(1)
  })
  it('tells the owner the workspace is approved, stamps the day and audits it', async () => {
    const { admin, ws, told } = await withOwner()
    const at = new Date('2026-11-13T10:00:00Z')
    expect((await approveWorkspace(ws.id, admin.id, at)).approvedAt).toEqual(at)
    expect(await told()).toEqual([{ title: 'Your workspace is approved', detail: 'Submit campaigns any time' }])
    expect(await db.auditEvent.count({ where: { action: 'workspace.approve', targetId: ws.id, actorId: admin.id } })).toBe(1)
  })
  it('tells the owner the workspace was declined, with the reason, and audits it (D4)', async () => {
    const { admin, ws, told } = await withOwner()
    await declineWorkspace(ws.id, admin.id, '  Not a registered business  ')
    expect(await told()).toEqual([{ title: 'Your workspace was declined', detail: 'Not a registered business' }])
    expect(await db.auditEvent.count({ where: { action: 'workspace.decline', targetId: ws.id, actorId: admin.id } })).toBe(1)
  })
  it('tells nobody when the decision is refused', async () => {
    const { admin, ws, told } = await withOwner('approved')
    await expect(declineWorkspace(ws.id, admin.id, 'Too late')).rejects.toBe('INVALID_TRANSITION')
    expect(await told()).toEqual([])
  })
})

describe('checkLink', () => {
  const res = (status: number) => (async () => ({ status, ok: status < 400 }) as Response) as typeof fetch
  it('is ok for 2xx and 3xx', async () => {
    expect(await checkLink('https://a.test', res(200))).toBe('ok')
    expect(await checkLink('https://a.test', res(302))).toBe('ok')
  })
  it('is broken for 404 and for a thrown error', async () => {
    expect(await checkLink('https://a.test', res(404))).toBe('broken')
    expect(await checkLink('https://a.test', (async () => { throw new Error('down') }) as typeof fetch)).toBe('broken')
  })
  it('gives up after the timeout it is handed', async () => {
    const hang = ((_: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as typeof fetch
    const started = Date.now()
    expect(await checkLink('https://a.test', hang, 50)).toBe('broken')
    expect(Date.now() - started).toBeLessThan(2000)
  })
})

describe('previewOffersAction', () => {
  const signIn = (u: { id: string; email: string; name: string; isGlobalAdmin: boolean }) =>
    vi.mocked(auth).mockResolvedValue({ user: u, expires: '2099-01-01' } as never)

  it('is for Global admins only', async () => {
    const u = await db.user.create({ data: { email: 'b@x.test', name: 'B', passwordHash: 'x' } })
    signIn({ ...u, isGlobalAdmin: true })
    await expect(previewOffersAction('NG')).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404')
  })

  it('lists the live offers in the campaign country for an admin', async () => {
    const { admin, c } = await setup()
    await approveCampaign(c.id, admin.id, AFTER_START)
    signIn(admin)
    expect((await previewOffersAction('NG')).map((o) => o.id)).toEqual([c.id])
    expect(await previewOffersAction('KE')).toEqual([])
    expect(Object.keys((await previewOffersAction('NG'))[0]).sort()).not.toContain('cta')
  })
})

// ---- The Review page (GLB §2.1) ----

// "Today" in the screenshots: 13 Nov 2026; the December draw runs 16–30 Nov.
const NOW = new Date('2026-11-13T09:00:00Z')
const okLinks = { checkLink: async (url: string) => (url.includes('broken') ? 'broken' : 'ok') as 'ok' | 'broken' }

const mkWs = (name: string, status: WorkspaceStatus = 'approved', extra: Partial<Prisma.WorkspaceCreateInput> = {}) =>
  db.workspace.create({ data: { name, type: 'Brand', country: 'NG', status, ...extra } })

// Kola Bright's "December draw teaser" as the prototype seeds it, in review.
const mkCampaign = (workspaceId: string, over: Partial<Prisma.CampaignUncheckedCreateInput> = {}) =>
  db.campaign.create({
    data: {
      workspaceId,
      name: 'December draw teaser',
      brand: 'Kola Bright',
      country: 'NG',
      category: 'Food & drink',
      headline: 'Win a year of Kola Bright',
      description: 'Enter the December draw with any purchase. NLRC approval no. 2026/0413.',
      placement: 'video',
      redeemMethod: 'link',
      linkUrl: 'https://kolabright.example/draw',
      budgetUsd: 400,
      startsAt: localMidnight('2026-11-16', 'NG'),
      endsAt: localMidnight('2026-11-30', 'NG'),
      rewardLocal: 100,
      shareRewardLabel: 'Earn ₦100 airtime',
      tileColor: tokens.tileColors[0],
      status: 'review',
      submittedAt: NOW,
      ...over,
    },
  })

const mkAdmin = () => db.user.create({ data: { email: 'gl@x.test', name: 'Global', passwordHash: 'x', isGlobalAdmin: true } })

const offerOf = (c: Awaited<ReturnType<typeof mkCampaign>>): OfferFields => ({
  brand: c.brand, category: c.category, headline: c.headline, description: c.description, tileColor: c.tileColor ?? '',
  creativeImageKey: c.creativeImageKey, creativeVideoKey: c.creativeVideoKey, placement: c.placement,
  redeemMethod: c.redeemMethod, claimCode: c.claimCode, linkUrl: c.linkUrl, ageGated: c.ageGated,
})

describe('reviewQueue — Campaigns waiting', () => {
  it('prints the chips in the prototype order: country, category, placement, budget, dates, redeem, reward', async () => {
    const ws = await mkWs('Kola Bright')
    await mkCampaign(ws.id)
    const { rows } = await reviewQueue(NOW, okLinks)
    expect(rows).toHaveLength(1)
    expect(rows[0].chips).toEqual([
      'Nigeria', 'Food & drink', 'Video', '$400', '16 Nov – 30 Nov', 'https://kolabright.example/draw', 'reward ₦100',
    ])
  })

  it('names a code offer "claim code" and prints the local reward with its symbol', async () => {
    const ws = await mkWs('SunFresh Juices', 'approved', { country: 'GH' })
    await mkCampaign(ws.id, {
      brand: 'SunFresh Juices', country: 'GH', placement: 'card', redeemMethod: 'code', claimCode: 'SUN50', linkUrl: null,
      budgetUsd: 300, rewardLocal: 50, startsAt: localMidnight('2026-11-14', 'GH'), endsAt: localMidnight('2026-11-28', 'GH'),
    })
    const [row] = (await reviewQueue(NOW, okLinks)).rows
    expect(row.chips).toEqual(['Ghana', 'Food & drink', 'Wall card', '$300', '14 Nov – 28 Nov', 'claim code', 'reward GH₵50'])
    expect(row.link).toBeNull()
  })

  it('shows the headline, "{brand} via {workspace}", the description and a cover of colour and initials', async () => {
    const ws = await mkWs('MediaSpec (agency)', 'approved', { type: 'Agency' })
    await mkCampaign(ws.id, { brand: '777Bet Metro', headline: 'Pata 10% ya mikeka uliyopoteza', tileColor: tokens.tileColors[2] })
    const [row] = (await reviewQueue(NOW, okLinks)).rows
    expect(row).toMatchObject({
      kind: 'campaign',
      title: 'Pata 10% ya mikeka uliyopoteza',
      byline: '777Bet Metro via MediaSpec (agency)',
      description: 'Enter the December draw with any purchase. NLRC approval no. 2026/0413.',
      cover: { imageUrl: null, color: tokens.tileColors[2], initials: '7BM' },
    })
  })

  it('names who created the campaign; one from before creators were recorded names no one', async () => {
    const ws = await mkWs('Kola Bright')
    const tunde = await db.user.create({ data: { email: 'tunde@x.test', name: 'Tunde Okafor', passwordHash: 'x' } })
    await mkCampaign(ws.id, { createdById: tunde.id })
    await mkCampaign(ws.id, { headline: 'Older offer', submittedAt: new Date(NOW.getTime() - 1000) })
    const { rows } = await reviewQueue(NOW, okLinks)
    expect(rows.map((r) => [r.title, r.createdBy])).toEqual([['Win a year of Kola Bright', 'Tunde Okafor'], ['Older offer', null]])
  })

  it('covers the row with the creative the campaign runs: the image, or a video at its first frame', async () => {
    const ws = await mkWs('Kola Bright')
    const image = '0b6f2a8e-3c1d-4e5f-9a7b-1c2d3e4f5a6b.jpg'
    const video = '0b6f2a8e-3c1d-4e5f-9a7b-1c2d3e4f5a6b.mp4'
    await mkCampaign(ws.id, { headline: 'Image offer', placement: 'card', creativeImageKey: image })
    await mkCampaign(ws.id, { headline: 'Video offer', creativeVideoKey: video, submittedAt: new Date(NOW.getTime() - 1000) })
    const { rows } = await reviewQueue(NOW, okLinks)
    expect(rows.map((r) => r.cover)).toEqual([
      { imageUrl: `/uploads/${image}`, videoUrl: null, color: tokens.tileColors[0], initials: 'KB' },
      { imageUrl: null, videoUrl: `/uploads/${video}`, color: tokens.tileColors[0], initials: 'KB' },
    ])
  })

  it('checks each link offer once and reports whether it answered', async () => {
    const ws = await mkWs('Kola Bright')
    await mkCampaign(ws.id)
    await mkCampaign(ws.id, { linkUrl: 'https://kolabright.example/broken', submittedAt: new Date(NOW.getTime() - 1000) })
    await mkCampaign(ws.id, { submittedAt: new Date(NOW.getTime() - 2000) })
    const asked: string[] = []
    const { rows } = await reviewQueue(NOW, {
      checkLink: async (url) => {
        asked.push(url)
        return url.includes('broken') ? 'broken' : 'ok'
      },
    })
    expect(rows.map((r) => r.link)).toEqual(['ok', 'broken', 'ok'])
    expect(asked.sort()).toEqual(['https://kolabright.example/broken', 'https://kolabright.example/draw'])
  })

  it('warns on betting and draws: licence found or not, 18+ shown or not', async () => {
    const ws = await mkWs('MediaSpec (agency)')
    await mkCampaign(ws.id, {
      category: 'Betting', headline: 'Pata 10% ya mikeka', description: 'Weka dau. 18+. GBT licence TZ-0921.', ageGated: true,
    })
    await mkCampaign(ws.id, {
      headline: 'Our December draw', description: 'Buy any bottle to enter.', ageGated: false,
      submittedAt: new Date(NOW.getTime() - 1000),
    })
    await mkCampaign(ws.id, {
      headline: 'Supa10 Jackpot', description: 'BCLB licence BK/0042.', ageGated: false, submittedAt: new Date(NOW.getTime() - 2000),
    })
    await mkCampaign(ws.id, {
      category: 'Betting', headline: 'Odds boost', description: 'Bet this weekend.', ageGated: true,
      submittedAt: new Date(NOW.getTime() - 3000),
    })
    // Kola Bright's December draw teaser: "draw" is in the description, not the headline, so no warning.
    await mkCampaign(ws.id, { submittedAt: new Date(NOW.getTime() - 4000) })
    const { rows } = await reviewQueue(NOW, okLinks)
    expect(rows.map((r) => r.warnings)).toEqual([
      ['Betting or draw — licence number present ✓ · 18+ shown ✓'],
      ['Betting or draw — no licence number found ✗ · 18+ missing ✗'],
      ['Betting or draw — licence number present ✓ · 18+ missing ✗'],
      ['Betting or draw — no licence number found ✗ · 18+ shown ✓'],
      [],
    ])
  })

  it('disables Approve while the workspace is pending or declined, and says why', async () => {
    const pending = await mkWs('SunFresh Juices', 'pending')
    const declined = await mkWs('Fake Brand', 'declined')
    const approved = await mkWs('Kola Bright', 'approved')
    await mkCampaign(pending.id, { submittedAt: new Date(NOW.getTime() - 1000) })
    await mkCampaign(declined.id, { submittedAt: new Date(NOW.getTime() - 2000) })
    await mkCampaign(approved.id, { submittedAt: new Date(NOW.getTime() - 3000) })
    const { rows } = await reviewQueue(NOW, okLinks)
    expect(rows.map((r) => [r.workspaceId, r.approveEnabled, r.warnings])).toEqual([
      [pending.id, false, ['Workspace not yet approved — approve it first.']],
      [declined.id, false, ["Workspace declined — campaigns can't go live."]],
      [approved.id, true, []],
    ])
  })

  it('lists the newest submission first and drops a campaign once it is approved or rejected', async () => {
    const admin = await mkAdmin()
    const ws = await mkWs('Kola Bright')
    const older = await mkCampaign(ws.id, { headline: 'Older', submittedAt: new Date(NOW.getTime() - 60_000) })
    const newer = await mkCampaign(ws.id, { headline: 'Newer' })
    expect((await reviewQueue(NOW, okLinks)).rows.map((r) => r.title)).toEqual(['Newer', 'Older'])
    await approveCampaign(newer.id, admin.id, NOW)
    expect((await reviewQueue(NOW, okLinks)).rows.map((r) => r.id)).toEqual([older.id])
    await rejectCampaign(older.id, admin.id, 'broken_link', '')
    expect((await reviewQueue(NOW, okLinks)).rows).toEqual([])
  })

  it('carries the preview of the offer as Phoenix would draw it', async () => {
    const ws = await mkWs('Kola Bright')
    const c = await mkCampaign(ws.id)
    const [row] = (await reviewQueue(NOW, okLinks)).rows
    expect(row.country).toBe('NG')
    expect(row.preview).toMatchObject({ id: c.id, headline: c.headline, placement: 'video', brand: 'Kola Bright' })
    // Every tab of the preview, its landing page and share sheet too, draws the campaign's own words.
    expect(row.preview).toMatchObject({
      description: c.description, rewardLabel: c.shareRewardLabel, redeemMethod: c.redeemMethod,
      endsAt: c.endsAt.toISOString(), country: 'NG', sampleLink: `${process.env.APP_URL}/o/preview`,
    })
  })
})

describe('reviewQueue — a revised offer (spec §6.14.3)', () => {
  async function liveWithRevision() {
    const admin = await mkAdmin()
    const ws = await mkWs('Kola Bright')
    const c = await mkCampaign(ws.id, {
      status: 'live', headline: 'Buy 2 bottles, get 1 free', redeemMethod: 'code', claimCode: 'KOLA3', linkUrl: null,
      submittedAt: new Date(NOW.getTime() - 86_400_000), placement: 'card', description: 'At any Shoprite.',
    })
    const later = new Date(NOW.getTime() + 60_000)
    const { revision } = await editOffer(c.id, admin.id, { ...offerOf(c), headline: 'Buy 3 bottles, get 2 free' }, later)
    return { admin, ws, c, revision: revision! }
  }

  it('names the campaign\'s creator on its revised offer', async () => {
    const { c } = await liveWithRevision()
    const ada = await db.user.create({ data: { email: 'ada@x.test', name: 'Ada Eze', passwordHash: 'x' } })
    await db.campaign.update({ where: { id: c.id }, data: { createdById: ada.id } })
    const [row] = (await reviewQueue(NOW, okLinks)).rows
    expect([row.kind, row.createdBy]).toEqual(['revision', 'Ada Eze'])
  })

  it('is a row titled "Revised offer · {headline}" with its chips from the revision', async () => {
    const { ws, c, revision } = await liveWithRevision()
    const { rows } = await reviewQueue(NOW, okLinks)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      kind: 'revision',
      id: revision.id,
      campaignId: c.id,
      workspaceId: ws.id,
      title: 'Revised offer · Buy 3 bottles, get 2 free',
      byline: 'Kola Bright via Kola Bright',
      approveEnabled: true,
      chips: ['Nigeria', 'Food & drink', 'Wall card', '$400', '16 Nov – 30 Nov', 'claim code', 'reward ₦100'],
    })
    expect(rows[0].preview).toMatchObject({
      id: c.id, headline: 'Buy 3 bottles, get 2 free', description: 'At any Shoprite.', rewardLabel: c.shareRewardLabel,
    })
  })

  it('leaves the queue once approved, with the revision applied to the live campaign', async () => {
    const { admin, c, revision } = await liveWithRevision()
    await approveRevision(revision.id, admin.id, NOW)
    expect((await reviewQueue(NOW, okLinks)).rows).toEqual([])
    expect(await db.campaign.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({
      status: 'live', headline: 'Buy 3 bottles, get 2 free', version: 2,
    })
  })

  it('leaves the queue once rejected, the campaign untouched', async () => {
    const { admin, c, revision } = await liveWithRevision()
    await rejectRevision(revision.id, admin.id, 'misleading_terms', 'Say which stores.', NOW)
    expect((await reviewQueue(NOW, okLinks)).rows).toEqual([])
    expect((await db.campaign.findUniqueOrThrow({ where: { id: c.id } })).headline).toBe('Buy 2 bottles, get 1 free')
  })

  it('counts in the Review badge with campaigns in review and pending workspaces', async () => {
    await liveWithRevision()
    const pending = await mkWs('SunFresh Juices', 'pending')
    await mkCampaign(pending.id)
    expect((await navCounts(null, true)).review).toBe(3)
    expect((await navCounts(null, false)).review).toBe(0)
  })
})

describe('reviewQueue — New advertisers and Live now', () => {
  it('lists pending workspaces with their owner and default credit', async () => {
    const ws = await mkWs('SunFresh Juices', 'pending', { country: 'GH', creditLimitCents: 50_000 })
    await mkWs('Kola Bright', 'approved')
    const kofi = await db.user.create({ data: { email: 'kofi@x.test', name: 'Kofi Mensah', passwordHash: 'x' } })
    await db.workspaceMember.create({ data: { userId: kofi.id, workspaceId: ws.id, role: 'Owner' } })
    const { pendingWorkspaces } = await reviewQueue(NOW, okLinks)
    expect(pendingWorkspaces).toEqual([
      { id: ws.id, name: 'SunFresh Juices', type: 'Brand', country: 'Ghana', owner: 'Kofi Mensah', creditCents: 50_000, demo: false },
    ])
  })

  it('gives every live campaign on the platform as its card, linking inside its own workspace', async () => {
    const kola = await mkWs('Kola Bright')
    const media = await mkWs('MediaSpec (agency)')
    const live = await mkCampaign(media.id, {
      status: 'live', brand: '777Bet', country: 'KE', headline: 'Supa10 Jackpot', startsAt: new Date(NOW.getTime() - 86_400_000),
      endsAt: new Date(NOW.getTime() + 9 * 86_400_000), submittedAt: new Date(NOW.getTime() - 86_400_000),
    })
    await mkCampaign(kola.id) // in review: not live
    const { livenow } = await reviewQueue(NOW, okLinks)
    expect(livenow).toHaveLength(1)
    expect(livenow[0]).toMatchObject({
      id: live.id,
      href: `/app/campaigns/${live.id}`,
      // The card's own address: its advertiser's Platform page, which opens without a workspace (Prompt 10).
      platformHref: `/admin/advertisers/${media.id}`,
      workspaceId: media.id,
      status: 'live',
      headline: 'Supa10 Jackpot',
      brand: '777Bet',
      country: 'Kenya',
      daysLeft: 9,
      mainLeft: '0 impressions',
    })
  })
})

describe('Review page', () => {
  afterEach(() => vi.unstubAllEnvs())

  // The visible text, tags removed, so assertions read like the screen.
  const text = (markup: string) =>
    markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&')
  const render = async () => renderToStaticMarkup(await ReviewPage())
  // Each queue row's markup, in order.
  const queueRows = (markup: string) => markup.split('class="q"').slice(1)

  async function signInAdmin() {
    const admin = await mkAdmin()
    vi.mocked(auth).mockResolvedValue({ user: { id: admin.id, isGlobalAdmin: true }, expires: '' } as never)
    return admin
  }

  it('shows the head, the KPI strip and the empty queue', async () => {
    await signInAdmin()
    const out = text(await render())
    expect(out).toContain('Platform › Review')
    expect(out).toContain('Nothing reaches a consumer until someone here approves it. Betting and draws must carry a licence number.')
    for (const t of ['Live on Phoenix', '0 waiting for review', 'Impressions', '0% open rate', 'Charged for delivery', '+ $0 rewards', 'Owed to Phoenix', '$0 kept by Global'])
      expect(out).toContain(t)
    expect(out).toContain('Campaigns waiting')
    expect(out).toContain('Real offer · lawful in market · terms clear · link works · betting and draws carry a licence or approval number and show 18+.')
    expect(out).toContain('Nothing waiting.')
    expect(out).not.toContain('New advertisers')
    expect(out).toContain('Live now')
  })

  it('shows a pending advertiser and its campaign with Approve disabled and the warning', async () => {
    await signInAdmin()
    const ws = await mkWs('SunFresh Juices', 'pending', { country: 'GH' })
    const kofi = await db.user.create({ data: { email: 'kofi@x.test', name: 'Kofi Mensah', passwordHash: 'x' } })
    await db.workspaceMember.create({ data: { userId: kofi.id, workspaceId: ws.id, role: 'Owner' } })
    await mkCampaign(ws.id, {
      brand: 'SunFresh Juices', headline: 'Free 33cl with any 1L', country: 'GH', redeemMethod: 'code', claimCode: 'S', linkUrl: null,
    })
    const ok = await mkWs('Kola Bright')
    await mkCampaign(ok.id, { redeemMethod: 'code', claimCode: 'K', linkUrl: null, submittedAt: new Date(NOW.getTime() - 1000) })
    const markup = await render()
    const out = text(markup)
    expect(out).toContain('New advertisers')
    expect(out).toContain('Approve the workspace before any of its campaigns can go live.')
    expect(out).toContain('SunFresh Juices · Brand · Ghana')
    expect(out).toContain('Owner Kofi Mensah · default credit $500')
    expect(out).toContain('2 waiting for review')
    const [sun, kola] = queueRows(markup.slice(markup.indexOf('Campaigns waiting')))
    expect(text(sun)).toContain('Free 33cl with any 1L · SunFresh Juices via SunFresh Juices')
    expect(text(sun)).toContain('Workspace not yet approved — approve it first.')
    expect(sun).toMatch(/<button[^>]*disabled=""[^>]*>Approve<\/button>/)
    expect(text(kola)).toContain('claim code')
    expect(kola).toMatch(/<button[^>]*>Approve<\/button>/)
    expect(kola).not.toMatch(/<button[^>]*disabled=""[^>]*>Approve<\/button>/)
    for (const label of ['Reject', 'Preview']) expect(kola).toContain(`>${label}</button>`)
  })

  it('says who created each waiting campaign, and shows its video at the first frame', async () => {
    await signInAdmin()
    const ws = await mkWs('Kola Bright')
    const tunde = await db.user.create({ data: { email: 'tunde@x.test', name: 'Tunde Okafor', passwordHash: 'x' } })
    const video = '0b6f2a8e-3c1d-4e5f-9a7b-1c2d3e4f5a6b.mp4'
    await mkCampaign(ws.id, { createdById: tunde.id, creativeVideoKey: video })
    const markup = await render()
    const [row] = queueRows(markup.slice(markup.indexOf('Campaigns waiting')))
    expect(text(row)).toContain('Win a year of Kola Bright · Kola Bright via Kola Bright · created by Tunde Okafor')
    expect(row).toContain(`<video src="/uploads/${video}#t=0.1" aria-label="The campaign&#x27;s video" muted="" playsInline="" preload="metadata"></video>`)
  })

  it('toasts each decision, or why nothing happened', () => {
    expect(say({ ok: true, toast: 'Approved — advertiser emailed' })).toBe(true)
    expect(takeToast()?.message).toBe('Approved — advertiser emailed')
    expect(say({ error: 'Approve the workspace first.' })).toBe(false)
    expect(takeToast()?.message).toBe('Approve the workspace first.')
  })

  it('toasts what Run daily job did', async () => {
    const summary = {
      skipped: false as const, charged: 2, ended: 0, started: 1, paused: 0, payouts: 0, monthClose: 'skipped' as const, invoices: 0, pace: 0, weekly: 0,
      errors: [],
    }
    await runAndSay(async () => ({ ok: true, summary }))
    expect(takeToast()?.message).toBe('Daily job ran — delivery, statuses and invoices updated')
    await runAndSay(async () => ({ ok: true, summary: { ...summary, errors: [{ duty: 'charge' as const, message: 'x' }] } }))
    expect(takeToast()?.message).toBe('Daily job ran with 1 error')
    await runAndSay(async () => ({ ok: true, summary: { skipped: true } }))
    expect(takeToast()?.message).toBe('The daily job already ran today.')
    await runAndSay(async () => ({ error: 'FORBIDDEN' }))
    expect(takeToast()?.message).toBe('Only Global can run the daily job.')
  })

  it('puts Simulate a day and Run daily job in the head only with DEMO_CONTROLS=1', async () => {
    await signInAdmin()
    vi.stubEnv('DEMO_CONTROLS', '')
    let out = text(await render())
    expect(out).not.toContain('Simulate a day')
    expect(out).not.toContain('Run daily job')
    vi.stubEnv('DEMO_CONTROLS', '1')
    out = text(await render())
    expect(out).toContain('Simulate a day')
    expect(out).toContain('Run daily job')
  })
})
