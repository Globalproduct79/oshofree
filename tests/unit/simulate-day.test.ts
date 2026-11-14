import type { Prisma } from '@prisma/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { simulateDayAction } from '@/app/admin/review/actions'
import ReviewPage from '@/app/admin/review/page'
import { simulateDayAction as simulateDayInWorkspace } from '@/app/app/(console)/campaigns/actions'
import HomePage from '@/app/app/(console)/page'
import SharingPage from '@/app/app/(console)/sharing/page'
import { simulateAndSay } from '@/components/demo/SimulateDayButton'
import { takeToast } from '@/components/shell/toast-store'
import { auth } from '@/lib/auth'
import { DEMO } from '@/lib/copy-demo'
import { db } from '@/lib/db'
import { generateDay } from '@/lib/demo/generator'
import { prng } from '@/lib/demo/prng'
import { simulateDay } from '@/lib/demo/simulate-day'
import { runDaily } from '@/lib/jobs/daily'
import { EXPECTED_OPEN_RATE } from '@/lib/estimate'
import { campaignMetrics } from '@/lib/reports'

vi.mock('@/lib/auth', () => ({ auth: vi.fn(), signOut: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const jar = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => jar }))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => '/app',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

const at = (iso: string) => new Date(iso)
// Saturday 14 Nov, 10:00 in Lagos. The simulated day is 13 Nov: Lagos is UTC+1, so it runs from 23:00 UTC
// on the 12th to 23:00 UTC on the 13th.
const NOW = at('2026-11-14T09:00:00Z')
const DAY = { start: at('2026-11-12T23:00:00Z'), end: at('2026-11-13T23:00:00Z') }

let seq = 0
const next = () => ++seq

// Kola Bright (Nigeria) with its Owner, Global, the Phoenix channel and one live campaign: $300 at Phoenix's
// $1.20 card CPM, ₦50 airtime per successful share at ₦1,550 to the dollar, flying 2 Nov – 20 Dec.
async function world() {
  const admin = await db.user.create({ data: { email: `g${next()}@x.test`, name: 'Global', passwordHash: 'x', isGlobalAdmin: true } })
  const owner = await db.user.create({ data: { email: `o${next()}@x.test`, name: 'Tunde Okafor', passwordHash: 'x' } })
  const ws = await db.workspace.create({
    data: { name: 'Kola Bright', type: 'Brand', country: 'NG', status: 'approved', members: { create: { userId: owner.id, role: 'Owner' } } },
  })
  const phoenix = await db.channel.create({ data: { key: 'phoenix', name: 'Phoenix Browser', apiKeyHash: 'x', isLive: true } })
  const campaign = await mkCampaign(ws.id)
  return { admin, owner, ws, phoenix, campaign }
}

const mkCampaign = (workspaceId: string, data: Partial<Prisma.CampaignUncheckedCreateInput> = {}) =>
  db.campaign.create({
    data: {
      workspaceId, name: 'Buy 2 get 1', brand: 'Kola Bright', country: 'NG', category: 'Food & drink',
      headline: 'Buy 2 bottles, get 1 free', description: 'd', placement: 'card', redeemMethod: 'code', budgetUsd: 300,
      shareRewardLabel: 'Earn ₦50 airtime', status: 'live', cpmCents: 120, fxPerUsd: 1550, rewardLocal: 50,
      startsAt: at('2026-11-01T23:00:00Z'), endsAt: at('2026-12-20T23:00:00Z'), ...data,
    },
  })

function signIn(u: { id: string; isGlobalAdmin: boolean }, workspaceId?: string) {
  vi.mocked(auth).mockResolvedValue({ user: { id: u.id, isGlobalAdmin: u.isGlobalAdmin }, expires: '' } as never)
  jar.get.mockImplementation((k: string) => (k === 'of_ws' && workspaceId ? { value: workspaceId } : undefined))
}

// The page reads the clock itself; only Date is faked so Prisma's timers keep running.
function clock(iso: Date) {
  if (!vi.isFakeTimers()) vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(iso)
}

const eventCounts = async () => ({
  channel: await db.channelEvent.count(),
  links: await db.shareLink.count(),
  linkEvents: await db.linkEvent.count(),
  payouts: await db.rewardPayout.count(),
  ledger: await db.ledgerEntry.count(),
})

beforeEach(() => {
  vi.clearAllMocks()
  takeToast()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('generateDay', () => {
  const card = { budgetUsd: 300, cpmCents: 120, placement: 'card' as const }

  it("follows the prototype's generator: day budget, 0.88 to delivery, open rate, 33 % claims, 9 % shares, 2.2 friend opens, 30 % friend claims", () => {
    // A steady 0.5 makes U(0.8, 1.3) = 1.05 and U(0.85, 1.15) = 1.
    const plan = generateDay(card, { spendCents: 0, daysLeft: 10 }, () => 0.5)
    // $300 over 10 days × 1.05 = $31.50; 88 % of it at $1.20 a thousand is 23,100 impressions.
    expect(plan).toEqual({
      dayCents: 3150, impressions: 23100, opens: 832, claims: 275, shares: 75, friendOpens: 165, friendClaims: 50,
      // 62 / 14 / 16 / 8 % of 75, the odd share to the largest remainder (WhatsApp before X on a tie).
      via: { whatsapp: 47, x: 10, facebook: 12, sms: 6 },
    })
    expect(Math.round(23100 * EXPECTED_OPEN_RATE.card)).toBe(832)
  })

  it('reads the open rate of the placement and divides by at least one day', () => {
    const plan = generateDay({ ...card, placement: 'splash' }, { spendCents: 0, daysLeft: 0 }, () => 0.5)
    // Nothing left in the flight counts as one day: the whole $300 × 1.05, capped at the $300 left.
    expect(plan?.dayCents).toBe(30000)
    expect(plan?.opens).toBe(Math.round(plan!.impressions * EXPECTED_OPEN_RATE.splash))
  })

  it('gives the same day for the same seed, and another day for another seed', () => {
    const facts = { spendCents: 4200, daysLeft: 20 }
    expect(generateDay(card, facts, prng(7))).toEqual(generateDay(card, facts, prng(7)))
    expect(generateDay(card, facts, prng(7))).not.toEqual(generateDay(card, facts, prng(8)))
  })

  it("never plans a delivery charge past what is left of the budget", () => {
    // $1,000 a thousand: one impression costs a dollar. With $1.80 left, 88 % would round up to 2 impressions.
    const dear = { budgetUsd: 300, cpmCents: 100_000, placement: 'card' as const }
    expect(generateDay(dear, { spendCents: 29_820, daysLeft: 1 }, () => 0.5)).toMatchObject({ dayCents: 180, impressions: 1 })
    const rng = prng(11)
    for (let i = 0; i < 500; i++) {
      const cpmCents = 50 + Math.floor(rng() * 200_000)
      const left = 1 + Math.floor(rng() * 30_000)
      const plan = generateDay({ budgetUsd: 300, cpmCents, placement: 'video' }, { spendCents: 30_000 - left, daysLeft: 1 + Math.floor(rng() * 40) }, rng)
      expect(plan!.dayCents).toBeLessThanOrEqual(left)
      expect(Math.round((plan!.impressions * cpmCents) / 1000)).toBeLessThanOrEqual(left)
    }
  })

  it('plans nothing for a campaign with nothing left or no CPM snapshot', () => {
    expect(generateDay(card, { spendCents: 30_000, daysLeft: 5 }, () => 0.5)).toBeNull()
    expect(generateDay(card, { spendCents: 31_000, daysLeft: 5 }, () => 0.5)).toBeNull()
    expect(generateDay({ ...card, cpmCents: null }, { spendCents: 0, daysLeft: 5 }, () => 0.5)).toBeNull()
  })
})

// A simulated day is thousands of rows through the real pipeline.
describe('simulateDay', { timeout: 60_000 }, () => {
  it('pushes the previous market day through ingestion, the share links, the landing page and the daily job', async () => {
    const { campaign: c, ws } = await world()
    const summary = await simulateDay(NOW, prng(7))
    const m = await campaignMetrics(c.id, NOW)

    // Every number the reports print grew, and is what the pipeline accepted.
    expect(summary).toMatchObject({ campaigns: 1, impressions: m.imp, opens: m.opens, claims: m.claims, shares: m.shares, friendOpens: m.sOpens })
    for (const n of [m.imp, m.opens, m.claims, m.shares, m.sOpens, m.sClaims]) expect(n).toBeGreaterThan(0)
    expect(m.imp).toBeGreaterThan(m.opens)
    expect(m.opens).toBeGreaterThan(m.claims)
    expect(summary.friendClaims).toBeGreaterThanOrEqual(m.sClaims)

    // The events sit inside 13 Nov in Lagos, posted as Phoenix batches.
    const span = await db.channelEvent.aggregate({ where: { campaignId: c.id }, _min: { at: true }, _max: { at: true } })
    expect(span._min.at!.getTime()).toBeGreaterThanOrEqual(DAY.start.getTime())
    expect(span._max.at!.getTime()).toBeLessThan(DAY.end.getTime())
    const batches = await db.channelBatch.findMany({ select: { key: true } })
    expect(batches.map((b) => b.key)).toContain(`sim:${c.id}:2026-11-13:0`)
    expect(batches.every((b) => b.key.startsWith(`sim:${c.id}:2026-11-13:`))).toBe(true)

    // The job charged 13 Nov: one delivery line, its impressions × the CPM snapshot.
    const delivery = await db.ledgerEntry.findMany({ where: { campaignId: c.id, kind: 'delivery' } })
    expect(delivery).toHaveLength(1)
    expect(delivery[0]).toMatchObject({
      workspaceId: ws.id, dedupeKey: `delivery:${c.id}:2026-11-13`, amountCents: -Math.round((m.imp * 120) / 1000),
    })
    expect(delivery[0].at.getTime()).toBeLessThan(DAY.end.getTime())
    expect(summary.job).toMatchObject({ skipped: false, charged: 1 })
    expect(await db.jobRun.count({ where: { name: 'daily', day: at('2026-11-13T00:00:00Z') } })).toBe(1)

    // Every sharer left a number; friends opened and claimed on the landing page and the claims paid out
    // through the fraud rules.
    const shared = await db.shareLink.findMany({ where: { campaignId: c.id, sharerType: 'Channel' } })
    expect(shared.length).toBe(m.shares)
    expect(shared.every((l) => l.consumerId && l.via && l.depth === 1)).toBe(true)
    const payouts = await db.rewardPayout.findMany({ where: { campaignId: c.id } })
    expect(summary.payouts).toBe(payouts.length)
    expect(payouts.filter((p) => p.status !== 'blocked').length).toBeGreaterThanOrEqual(1)
    expect(payouts.every((p) => p.createdAt >= DAY.start && p.createdAt < DAY.end)).toBe(true)
    expect(await db.ledgerEntry.count({ where: { campaignId: c.id, kind: 'reward' } })).toBeGreaterThan(0)
    // Some friends left their own number: a link of their own one level down, and a DetailsLeft row.
    const details = await db.linkEvent.count({ where: { type: 'DetailsLeft', visitorId: { startsWith: 'simv-' } } })
    const children = await db.shareLink.findMany({ where: { campaignId: c.id, depth: 2 }, include: { consumer: true } })
    expect(details).toBeGreaterThan(0)
    expect(children).toHaveLength(details)
    expect(new Set(children.map((l) => l.consumer?.phone)).size).toBe(children.length)
    expect(children.every((l) => l.consumer?.phone.startsWith('+234'))).toBe(true)
  })

  it('splits the shares across WhatsApp, X, Facebook and SMS', async () => {
    const { campaign: c } = await world()
    await simulateDay(NOW, prng(3))
    const m = await campaignMetrics(c.id, NOW)
    expect(m.channels.whatsapp).toBeGreaterThan(m.channels.facebook)
    expect(m.channels.facebook).toBeGreaterThan(m.channels.sms)
    expect(m.channels.x).toBeGreaterThan(0)
    expect(m.channels.whatsapp + m.channels.facebook + m.channels.x + m.channels.sms).toBe(m.shares)
  })

  it('runs once a calendar day: a second click throws ALREADY_SIMULATED and adds nothing', async () => {
    await world()
    await simulateDay(NOW, prng(7))
    const before = await eventCounts()
    await expect(simulateDay(at('2026-11-14T21:00:00Z'), prng(9))).rejects.toBe('ALREADY_SIMULATED')
    expect(await eventCounts()).toEqual(before)
    // The next day simulates 14 Nov.
    const tomorrow = await simulateDay(at('2026-11-15T08:00:00Z'), prng(9))
    expect(tomorrow.impressions).toBeGreaterThan(0)
    expect(await db.ledgerEntry.count({ where: { kind: 'delivery' } })).toBe(2)
  })

  it('charges the day even when the daily job already ran it, without charging anything twice', async () => {
    const { campaign: c } = await world()
    // Run daily job (Review) yesterday claimed 13 Nov with nothing to charge.
    await db.jobRun.create({ data: { name: 'daily', day: at('2026-11-13T00:00:00Z') } })
    const summary = await simulateDay(NOW, prng(7))
    expect(summary.job).toMatchObject({ skipped: false, charged: 1 })
    expect(await db.ledgerEntry.count({ where: { campaignId: c.id, kind: 'delivery' } })).toBe(1)
  })

  it("charges a day the job already charged up to the day's whole total, on its one line (a seeded yesterday)", async () => {
    const { campaign: c, phoenix } = await world()
    await db.channelEvent.createMany({
      data: Array.from({ length: 1000 }, (_, i) => ({
        channelId: phoenix.id, campaignId: c.id, type: 'Impression' as const, sessionId: `seed-${i}`, at: at('2026-11-13T12:00:00Z'), dedupeKey: `seed-${i}`,
      })),
    })
    await runDaily(at('2026-11-13T12:00:00Z'), at('2026-11-14T02:00:00Z'))
    const summary = await simulateDay(NOW, prng(7))
    const delivery = await db.ledgerEntry.findMany({ where: { campaignId: c.id, kind: 'delivery' } })
    expect(delivery).toHaveLength(1)
    expect(delivery[0].amountCents).toBe(-Math.round(((1000 + summary.impressions) * 120) / 1000))
  })

  it('delivers only live campaigns of approved workspaces, from their start, and nothing past the budget', async () => {
    const { ws, campaign: live } = await world()
    const paused = await mkCampaign(ws.id, { name: 'Paused', status: 'paused' })
    const scheduled = await mkCampaign(ws.id, { name: 'Scheduled', status: 'scheduled', startsAt: at('2026-11-20T23:00:00Z') })
    // Started this morning: it was not on Phoenix yesterday.
    const today = await mkCampaign(ws.id, { name: 'Today', startsAt: at('2026-11-13T23:00:00Z') })
    // Started at noon yesterday: only the afternoon is delivered.
    const noon = await mkCampaign(ws.id, { name: 'Noon', startsAt: at('2026-11-13T11:00:00Z') })
    const spent = await mkCampaign(ws.id, { name: 'Spent' })
    await db.ledgerEntry.create({ data: { workspaceId: ws.id, campaignId: spent.id, at: at('2026-11-05T12:00:00Z'), amountCents: -30000, kind: 'delivery', description: 'earlier' } })
    const declinedWs = await db.workspace.create({ data: { name: 'Gone', type: 'Brand', country: 'NG', status: 'declined' } })
    const declined = await mkCampaign(declinedWs.id, { name: 'Declined' })

    const summary = await simulateDay(NOW, prng(7))
    expect(summary.campaigns).toBe(2)
    const imp = async (id: string) => db.channelEvent.count({ where: { campaignId: id, type: 'Impression' } })
    expect(await imp(live.id)).toBeGreaterThan(0)
    for (const c of [paused, scheduled, today, spent, declined]) expect(await imp(c.id)).toBe(0)
    const first = await db.channelEvent.aggregate({ where: { campaignId: noon.id }, _min: { at: true } })
    expect(first._min.at!.getTime()).toBeGreaterThanOrEqual(at('2026-11-13T11:00:00Z').getTime())
    // The daily job ended the spent campaign.
    expect((await db.campaign.findUniqueOrThrow({ where: { id: spent.id } })).status).toBe('ended')
  })

  it('needs a live Phoenix channel', async () => {
    const { phoenix } = await world()
    await db.channel.update({ where: { id: phoenix.id }, data: { isLive: false } })
    await expect(simulateDay(NOW, prng(7))).rejects.toBe('NO_PHOENIX')
    expect(await db.jobRun.count()).toBe(0)
  })
})

describe('simulateDayAction', { timeout: 60_000 }, () => {
  it('is refused without DEMO_CONTROLS', async () => {
    const { admin } = await world()
    vi.stubEnv('DEMO_CONTROLS', '')
    signIn(admin)
    expect(await simulateDayAction()).toEqual({ error: 'FORBIDDEN' })
    expect(await db.jobRun.count()).toBe(0)
    expect(await db.channelEvent.count()).toBe(0)
  })

  it('is refused for anyone but Global, inside a workspace too', async () => {
    const { owner, ws } = await world()
    vi.stubEnv('DEMO_CONTROLS', '1')
    signIn(owner, ws.id)
    expect(await simulateDayAction()).toEqual({ error: 'FORBIDDEN' })
    expect(await simulateDayInWorkspace()).toEqual({ error: 'FORBIDDEN' })
    expect(await db.jobRun.count()).toBe(0)
  })

  it('simulates the day for Global with DEMO_CONTROLS, audited, once a day', async () => {
    const { admin } = await world()
    vi.stubEnv('DEMO_CONTROLS', '1')
    clock(NOW)
    signIn(admin)
    const res = await simulateDayAction()
    expect(res).toMatchObject({ ok: true, summary: { campaigns: 1, job: { skipped: false } } })
    expect(await db.channelEvent.count({ where: { type: 'Impression' } })).toBeGreaterThan(0)
    const audits = await db.auditEvent.findMany({ where: { action: 'demo.simulate' } })
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({ actorId: admin.id, targetType: 'JobRun' })
    expect(await simulateDayAction()).toEqual({ error: 'ALREADY_SIMULATED' })
    expect(await db.auditEvent.count({ where: { action: 'demo.simulate' } })).toBe(1)
  })

  it('works from a workspace page for Global inside the workspace', async () => {
    const { admin, ws } = await world()
    vi.stubEnv('DEMO_CONTROLS', '1')
    clock(NOW)
    signIn(admin, ws.id)
    expect(await simulateDayInWorkspace()).toMatchObject({ ok: true, summary: { campaigns: 1 } })
  })

  it("toasts the prototype's line, or why nothing happened", async () => {
    await simulateAndSay(async () => ({ ok: true }))
    expect(takeToast()?.message).toBe('Simulated one day on Phoenix — delivery, shares, rewards and statements updated')
    await simulateAndSay(async () => ({ error: 'ALREADY_SIMULATED' }))
    expect(takeToast()?.message).toBe('Already simulated today.')
    await simulateAndSay(async () => ({ error: 'FORBIDDEN' }))
    expect(takeToast()?.message).toBe(DEMO.errors.FORBIDDEN)
  })
})

describe('the Simulate a day button', { timeout: 30_000 }, () => {
  const BUTTON = '>Simulate a day</button>'
  const home = async () => renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }))
  const sharing = async () => renderToStaticMarkup(await SharingPage({}))
  const review = async () => renderToStaticMarkup(await ReviewPage())

  it('shows on Campaigns home and Sharing for Global with DEMO_CONTROLS, and for no one else', async () => {
    const { admin, owner, ws } = await world()
    clock(NOW)
    vi.stubEnv('DEMO_CONTROLS', '1')
    signIn(admin, ws.id)
    expect(await home()).toContain(BUTTON)
    expect(await sharing()).toContain(BUTTON)
    signIn(owner, ws.id)
    expect(await home()).not.toContain(BUTTON)
    expect(await sharing()).not.toContain(BUTTON)
    vi.stubEnv('DEMO_CONTROLS', '')
    signIn(admin, ws.id)
    expect(await home()).not.toContain(BUTTON)
    expect(await sharing()).not.toContain(BUTTON)
  })

  it('is a ghost button before + New campaign on Campaigns home', async () => {
    const { admin, ws } = await world()
    clock(NOW)
    vi.stubEnv('DEMO_CONTROLS', '1')
    signIn(admin, ws.id)
    const markup = await home()
    expect(markup).toContain(`<button class="btn g" type="submit"${BUTTON}`)
    expect(markup.indexOf(BUTTON)).toBeLessThan(markup.indexOf('New campaign'))
  })

  it('shows on Review only with DEMO_CONTROLS', async () => {
    const { admin } = await world()
    clock(NOW)
    signIn(admin)
    vi.stubEnv('DEMO_CONTROLS', '1')
    expect(await review()).toContain(BUTTON)
    vi.stubEnv('DEMO_CONTROLS', '')
    expect(await review()).not.toContain(BUTTON)
  })
})
