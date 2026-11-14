import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { ChannelEventType, NotificationKind, Prisma } from '@prisma/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runDailyJobAction } from '@/app/admin/review/actions'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { runDaily } from '@/lib/jobs/daily'

vi.mock('@/lib/auth', () => ({ auth: vi.fn(), signOut: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
// The real payouts, unless a test switches the aggregator off.
const aggregator = vi.hoisted(() => ({ down: false }))
vi.mock('@/lib/rewards', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/rewards')>()
  return {
    ...real,
    sendQueuedPayouts: async (now?: Date) => {
      if (aggregator.down) throw new Error('aggregator down')
      return real.sendQueuedPayouts(now)
    },
  }
})

const at = (iso: string) => new Date(iso)

// Kola Bright, Nigeria. Lagos is UTC+1, so its midnight on day D is 23:00 UTC on D−1.
async function world(opts: { limitCents?: number } = {}) {
  const owner = await db.user.create({ data: { email: 'tunde@x.test', name: 'Tunde', passwordHash: 'x' } })
  const ws = await db.workspace.create({
    data: {
      name: 'Kola Bright', type: 'Brand', country: 'NG', status: 'approved', creditLimitCents: opts.limitCents ?? 150000,
      members: { create: { userId: owner.id, role: 'Owner' } },
    },
  })
  const phoenix = await db.channel.create({ data: { key: 'phoenix', name: 'Phoenix Browser', apiKeyHash: 'x', isLive: true } })
  return { owner, ws, phoenix }
}

// Live at Phoenix's $1.20 card CPM, $300 budget, flying 2 Nov – 20 Dec in Lagos.
const campaign = (workspaceId: string, data: Partial<Prisma.CampaignUncheckedCreateInput> = {}) =>
  db.campaign.create({
    data: {
      workspaceId, name: 'Buy 2 get 1', brand: 'Kola Bright', country: 'NG', category: 'Food & drink',
      headline: 'Buy 2 bottles, get 1 free', description: 'd', placement: 'card', redeemMethod: 'code', budgetUsd: 300,
      shareRewardLabel: 'Earn ₦50 airtime', status: 'live', cpmCents: 120, fxPerUsd: 1550,
      startsAt: at('2026-11-01T23:00:00Z'), endsAt: at('2026-12-20T23:00:00Z'), ...data,
    },
  })

let seq = 0
const events = (channelId: string, campaignId: string, type: ChannelEventType, n: number, iso: string) =>
  db.channelEvent.createMany({
    data: Array.from({ length: n }, () => ({ channelId, campaignId, type, sessionId: `s${++seq}`, at: at(iso), dedupeKey: `k${seq}` })),
  })

const spent = (workspaceId: string, campaignId: string, cents: number, iso = '2026-11-05T12:00:00Z') =>
  db.ledgerEntry.create({ data: { workspaceId, campaignId, at: at(iso), amountCents: -cents, kind: 'delivery', description: 'earlier' } })

const deliveries = (campaignId: string) => db.ledgerEntry.findMany({ where: { campaignId, kind: 'delivery', description: { not: 'earlier' } } })
const notes = (kind: NotificationKind) => db.notification.findMany({ where: { kind }, orderBy: { createdAt: 'asc' } })
const statusOf = async (id: string) => (await db.campaign.findUniqueOrThrow({ where: { id } })).status

describe('runDaily — delivery charges', () => {
  it("charges a live campaign's market-local day once, however often the day is run", async () => {
    const { ws, phoenix } = await world()
    const c = await campaign(ws.id)
    await events(phoenix.id, c.id, 'Impression', 1000, '2026-11-10T12:00:00Z')
    await events(phoenix.id, c.id, 'Impression', 500, '2026-11-09T23:30:00Z') // 00:30 on 10 Nov in Lagos
    await events(phoenix.id, c.id, 'Impression', 300, '2026-11-09T22:30:00Z') // still 9 Nov in Lagos
    await events(phoenix.id, c.id, 'Impression', 200, '2026-11-10T23:00:00Z') // already 11 Nov in Lagos
    await events(phoenix.id, c.id, 'Open', 50, '2026-11-10T12:00:00Z')

    const first = await runDaily(at('2026-11-10T12:00:00Z'))
    expect(first).toMatchObject({ skipped: false, charged: 1 })
    const again = await runDaily(at('2026-11-10T20:00:00Z'))
    expect(again).toEqual({ skipped: true })

    const rows = await deliveries(c.id)
    expect(rows).toHaveLength(1)
    // 1,500 impressions × 120 ¢ ÷ 1,000.
    expect(rows[0]).toMatchObject({
      workspaceId: ws.id, amountCents: -180, kind: 'delivery', description: 'Buy 2 get 1 — delivery',
      dedupeKey: `delivery:${c.id}:2026-11-10`, at: at('2026-11-10T12:00:00Z'),
    })
    expect(await db.jobRun.findMany({ where: { name: 'daily' }, select: { day: true } })).toEqual([{ day: at('2026-11-10T00:00:00Z') }])
  })

  it('gives the day back when a run fails, and the re-run charges nothing twice', async () => {
    const { ws, phoenix } = await world()
    const c = await campaign(ws.id)
    await events(phoenix.id, c.id, 'Impression', 1000, '2026-11-10T12:00:00Z')
    aggregator.down = true
    try {
      await expect(runDaily(at('2026-11-10T12:00:00Z'))).rejects.toThrow('aggregator down')
    } finally {
      aggregator.down = false
    }
    expect(await db.jobRun.count({ where: { name: 'daily' } })).toBe(0)
    expect(await runDaily(at('2026-11-10T13:00:00Z'))).toMatchObject({ skipped: false })
    expect(await deliveries(c.id)).toHaveLength(1)
  })

  it('dates a charge inside the day it charges when the job runs the next morning', async () => {
    const { ws, phoenix } = await world()
    const c = await campaign(ws.id)
    await events(phoenix.id, c.id, 'Impression', 1000, '2026-11-10T12:00:00Z')
    await runDaily(at('2026-11-10T12:00:00Z'), at('2026-11-11T02:00:00Z'))
    const [row] = await deliveries(c.id)
    expect(row).toMatchObject({ amountCents: -120, at: at('2026-11-10T22:59:59.999Z') })
  })

  it('charges nothing without impressions, without a CPM snapshot, or for a campaign that is not live', async () => {
    const { ws, phoenix } = await world()
    const quiet = await campaign(ws.id)
    const unpriced = await campaign(ws.id, { name: 'Unpriced', cpmCents: null })
    const paused = await campaign(ws.id, { name: 'Paused', status: 'paused', pausedBy: 'user' })
    await events(phoenix.id, unpriced.id, 'Impression', 1000, '2026-11-10T12:00:00Z')
    await events(phoenix.id, paused.id, 'Impression', 1000, '2026-11-10T12:00:00Z')
    expect(await runDaily(at('2026-11-10T12:00:00Z'))).toMatchObject({ charged: 0 })
    expect(await db.ledgerEntry.count()).toBe(0)
    expect(await statusOf(quiet.id)).toBe('live')
  })
})

describe('runDaily — ending', () => {
  it('ends a campaign whose budget is spent through endCampaign: the charge stops at the budget, a pending revision goes', async () => {
    const { ws, phoenix } = await world()
    const c = await campaign(ws.id)
    await spent(ws.id, c.id, 29_950)
    await db.campaignRevision.create({ data: { campaignId: c.id, data: {} } })
    await events(phoenix.id, c.id, 'Impression', 1000, '2026-11-10T12:00:00Z') // 120 ¢, 50 ¢ of budget left

    const summary = await runDaily(at('2026-11-10T12:00:00Z'))
    expect(summary).toMatchObject({ charged: 1, ended: 1 })
    expect((await deliveries(c.id))[0].amountCents).toBe(-50)
    expect(await db.campaign.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ status: 'ended', endedAt: at('2026-11-10T12:00:00Z') })
    expect(await db.campaignRevision.count({ where: { campaignId: c.id } })).toBe(0)
    const [note] = await notes('ended')
    expect(note).toMatchObject({ title: 'Buy 2 get 1 ended', detail: 'budget fully delivered', href: `/app/campaigns/${c.id}` })
  })

  it('keeps a flight running through the last day of its market', async () => {
    const { ws } = await world()
    const c = await campaign(ws.id, { endsAt: at('2026-11-10T23:00:00Z') }) // last day 10 Nov in Lagos
    expect(await runDaily(at('2026-11-10T22:30:00Z'))).toMatchObject({ ended: 0 })
    expect(await statusOf(c.id)).toBe('live')
  })

  it('ends live and paused flights once their end date arrives in the market, with impressions and open rate', async () => {
    const { ws, phoenix } = await world()
    const c = await campaign(ws.id, { endsAt: at('2026-11-10T23:00:00Z') })
    const paused = await campaign(ws.id, { name: 'Weekend cashback', status: 'paused', pausedBy: 'user', endsAt: at('2026-11-10T23:00:00Z') })
    await events(phoenix.id, c.id, 'Impression', 2000, '2026-11-05T12:00:00Z')
    await events(phoenix.id, c.id, 'Open', 100, '2026-11-05T12:00:00Z')

    expect(await runDaily(at('2026-11-10T23:00:00Z'))).toMatchObject({ ended: 2 })
    expect(await statusOf(c.id)).toBe('ended')
    expect(await statusOf(paused.id)).toBe('ended')
    const told = await notes('ended')
    expect(told.map((n) => [n.title, n.detail])).toEqual(
      expect.arrayContaining([
        ['Buy 2 get 1 ended', '2.0k impressions · 5.0% open rate'],
        ['Weekend cashback ended', '0 impressions · 0% open rate'],
      ]),
    )
  })
})

describe('runDaily — starting at market midnight', () => {
  // Scheduled for 11 Nov in Lagos: 23:00 UTC on 10 Nov.
  const scheduled = (workspaceId: string) =>
    campaign(workspaceId, { status: 'scheduled', startsAt: at('2026-11-10T23:00:00Z'), endsAt: at('2026-11-24T23:00:00Z') })

  it('does not start a campaign half an hour before Lagos midnight', async () => {
    const { ws } = await world()
    const c = await scheduled(ws.id)
    expect(await runDaily(at('2026-11-10T22:30:00Z'))).toMatchObject({ started: 0 })
    expect(await statusOf(c.id)).toBe('scheduled')
    expect(await notes('approved')).toEqual([])
  })

  it('starts it at Lagos midnight and tells the workspace', async () => {
    const { ws } = await world()
    const c = await scheduled(ws.id)
    expect(await runDaily(at('2026-11-10T23:00:00Z'))).toMatchObject({ started: 1 })
    expect(await statusOf(c.id)).toBe('live')
    const [note] = await notes('approved')
    expect(note).toMatchObject({ title: 'Buy 2 get 1 is live on Phoenix', href: `/app/campaigns/${c.id}` })
  })
})

describe('runDaily — credit, payouts', () => {
  it("pauses an over-limit workspace's live campaigns and says why; one under its limit keeps running", async () => {
    const { ws } = await world({ limitCents: 10_000 }) // $100 limit, a $300 campaign committed
    const c = await campaign(ws.id)
    const other = await db.workspace.create({ data: { name: 'Pesa Link', type: 'Brand', country: 'KE', status: 'approved', creditLimitCents: 150000 } })
    const fine = await campaign(other.id, { name: 'Send money free', country: 'KE' })

    expect(await runDaily(at('2026-11-10T12:00:00Z'))).toMatchObject({ paused: 1 })
    expect(await db.campaign.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ status: 'paused', pausedBy: 'credit' })
    expect(await statusOf(fine.id)).toBe('live')
    const [note] = await notes('credit')
    expect(note).toMatchObject({
      workspaceId: ws.id,
      title: 'Buy 2 get 1 paused — credit limit reached',
      detail: 'pay an open invoice or ask Global to raise the limit',
    })
  })

  it('sends queued payouts the aggregator balance covers', async () => {
    const { ws, phoenix } = await world()
    const c = await campaign(ws.id)
    const link = await db.shareLink.create({ data: { code: 'ROOT0001', campaignId: c.id, channelId: phoenix.id, depth: 0, sharerType: 'Root' } })
    await db.aggregatorAccount.create({ data: { id: 'reloadly', balanceCents: 1000 } })
    const p = await db.rewardPayout.create({
      data: { campaignId: c.id, workspaceId: ws.id, shareLinkId: link.id, claimEventKey: 'claim-1', amountLocal: 50, amountCents: 3, status: 'queued' },
    })
    expect(await runDaily(at('2026-11-10T12:00:00Z'))).toMatchObject({ payouts: 1 })
    expect(await db.rewardPayout.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ status: 'sent', sentAt: at('2026-11-10T12:00:00Z') })
  })
})

describe('runDaily — closing the month', () => {
  it("on the 1st closes last month after posting the day's delivery, so the invoice carries that line", async () => {
    const { ws, phoenix } = await world()
    await db.marketFx.create({ data: { country: 'NG', fxPerUsd: 1550, effectiveFrom: at('2026-10-01T00:00:00Z') } })
    const c = await campaign(ws.id)
    await events(phoenix.id, c.id, 'Impression', 1000, '2026-11-30T20:00:00Z') // 30 Nov in Lagos

    // The run on the morning of 1 Dec charges 30 Nov, then closes November.
    const summary = await runDaily(at('2026-11-30T12:00:00Z'), at('2026-12-01T02:00:00Z'))
    expect(summary).toMatchObject({ charged: 1, monthClose: 'closed' })
    const invoice = await db.invoice.findFirstOrThrow({ where: { workspaceId: ws.id }, include: { entries: true } })
    expect(invoice).toMatchObject({ period: at('2026-10-31T23:00:00Z'), amountCents: 120, status: 'due' })
    expect(invoice.entries.map((e) => e.description)).toEqual(['Buy 2 get 1 — delivery'])
    // The job is the actor: the issue is audited with no user.
    expect(await db.auditEvent.findFirstOrThrow({ where: { action: 'invoice.issue' } })).toMatchObject({ actorId: null, targetId: invoice.id })
  })

  it('leaves the month alone on other days, and reports a market without FX instead of failing', async () => {
    const { ws, phoenix } = await world()
    const c = await campaign(ws.id)
    await events(phoenix.id, c.id, 'Impression', 1000, '2026-11-30T20:00:00Z')
    expect(await runDaily(at('2026-11-30T12:00:00Z'))).toMatchObject({ monthClose: 'skipped' })
    expect(await runDaily(at('2026-12-02T12:00:00Z'))).toMatchObject({ monthClose: 'no_fx' })
    expect(await db.invoice.count()).toBe(0)
  })
})

describe('runDaily — pace and the weekly digest', () => {
  // Halfway through a 14-day flight at 09:00 UTC on 10 Nov.
  const halfway = { startsAt: at('2026-11-03T09:00:00Z'), endsAt: at('2026-11-17T09:00:00Z') }

  it('warns once per market day when a live campaign runs fast', async () => {
    const { ws } = await world()
    const c = await campaign(ws.id, halfway)
    await spent(ws.id, c.id, 24_000) // 80 % of budget at 50 % of the flight: pace 1.6

    await runDaily(at('2026-11-09T12:00:00Z'), at('2026-11-10T09:00:00Z'))
    await runDaily(at('2026-11-10T12:00:00Z'), at('2026-11-10T10:00:00Z')) // same day in Lagos
    let told = await notes('pace')
    expect(told).toHaveLength(1)
    // 14 days × (1 − 1 ÷ 1.6) ≈ 5 days.
    expect(told[0]).toMatchObject({ title: 'Buy 2 get 1 is delivering faster than planned', detail: 'budget will finish ~5 days early' })

    await runDaily(at('2026-11-11T12:00:00Z'), at('2026-11-11T09:00:00Z'))
    told = await notes('pace')
    expect(told).toHaveLength(2)
  })

  it('warns when a live campaign runs slow, and not members who turned pace off', async () => {
    const { ws, owner } = await world()
    const viewer = await db.user.create({ data: { email: 'ada@x.test', name: 'Ada', passwordHash: 'x' } })
    await db.workspaceMember.create({ data: { userId: viewer.id, workspaceId: ws.id, role: 'Viewer' } })
    await db.notificationPref.create({ data: { userId: viewer.id, workspaceId: ws.id, kind: 'pace', enabled: false } })
    const c = await campaign(ws.id, halfway)
    await spent(ws.id, c.id, 3_000) // 10 % at 50 %: pace 0.2

    expect(await runDaily(at('2026-11-10T09:00:00Z'))).toMatchObject({ pace: 1 })
    const told = await notes('pace')
    expect(told.map((n) => n.userId)).toEqual([owner.id])
    // 14 days × (1 ÷ 0.2 − 1) = 56 days.
    expect(told[0]).toMatchObject({ title: 'Buy 2 get 1 is delivering slower than planned', detail: 'budget will last ~56 days longer' })
  })

  it('leaves a campaign on pace alone', async () => {
    const { ws } = await world()
    const c = await campaign(ws.id, halfway)
    await spent(ws.id, c.id, 15_000)
    expect(await runDaily(at('2026-11-10T09:00:00Z'))).toMatchObject({ pace: 0 })
  })

  // 16 Nov 2026 is a Monday; 08:00 in Lagos is 07:00 UTC. The week is 9–15 Nov in Lagos.
  async function week() {
    const w = await world()
    await db.notificationPref.create({ data: { userId: w.owner.id, workspaceId: w.ws.id, kind: 'weekly', enabled: true } })
    const c = await campaign(w.ws.id)
    await campaign(w.ws.id, { name: 'Weekend cashback', status: 'paused', pausedBy: 'user' })
    await events(w.phoenix.id, c.id, 'Impression', 1500, '2026-11-12T12:00:00Z')
    await events(w.phoenix.id, c.id, 'Impression', 200, '2026-11-08T22:00:00Z') // 8 Nov in Lagos: the week before
    await spent(w.ws.id, c.id, 1_200, '2026-11-12T12:00:00Z')
    await spent(w.ws.id, c.id, 500, '2026-11-08T22:00:00Z')
    return w
  }

  it('sends the weekly digest from 08:00 on Monday in the market, once', async () => {
    const { ws } = await week()
    expect(await runDaily(at('2026-11-15T12:00:00Z'), at('2026-11-16T07:00:00Z'))).toMatchObject({ weekly: 1 })
    expect(await runDaily(at('2026-11-16T12:00:00Z'), at('2026-11-16T09:00:00Z'))).toMatchObject({ weekly: 0 })
    const told = await notes('weekly')
    expect(told).toHaveLength(1)
    expect(told[0]).toMatchObject({ workspaceId: ws.id, title: 'Your week on Phoenix', detail: '1 live · 1.5k impressions · $12 spent' })
  })

  it('sends no digest before 08:00 on Monday or on another day', async () => {
    await week()
    expect(await runDaily(at('2026-11-16T06:59:00Z'))).toMatchObject({ weekly: 0 }) // 07:59 in Lagos
    expect(await runDaily(at('2026-11-17T09:00:00Z'))).toMatchObject({ weekly: 0 }) // Tuesday
    expect(await notes('weekly')).toEqual([])
  })
})

describe('runDailyJobAction', () => {
  afterEach(() => vi.unstubAllEnvs())

  async function signIn(isGlobalAdmin: boolean) {
    const user = await db.user.create({ data: { email: `${isGlobalAdmin ? 'admin' : 'tunde'}@x.test`, name: 'U', passwordHash: 'x', isGlobalAdmin } })
    vi.mocked(auth).mockResolvedValue({ user: { id: user.id, isGlobalAdmin }, expires: '' } as never)
  }

  it('is refused without DEMO_CONTROLS', async () => {
    vi.stubEnv('DEMO_CONTROLS', '')
    await signIn(true)
    expect(await runDailyJobAction()).toEqual({ error: 'FORBIDDEN' })
    expect(await db.jobRun.count()).toBe(0)
  })

  it('is refused for anyone but Global', async () => {
    vi.stubEnv('DEMO_CONTROLS', '1')
    await signIn(false)
    expect(await runDailyJobAction()).toEqual({ error: 'FORBIDDEN' })
    expect(await db.jobRun.count()).toBe(0)
  })

  it("runs today's job for Global with DEMO_CONTROLS", async () => {
    vi.stubEnv('DEMO_CONTROLS', '1')
    await signIn(true)
    expect(await runDailyJobAction()).toMatchObject({ ok: true, summary: { skipped: false } })
    expect(await db.jobRun.count({ where: { name: 'daily' } })).toBe(1)
  })
})

// `npm run job:daily` runs under tsx, where `server-only` does not resolve: nothing the job imports may pull it.
describe('the daily job under tsx', () => {
  const root = path.resolve(import.meta.dirname, '../..')
  const resolve = (spec: string, from: string): string | null => {
    const base = spec.startsWith('@/') ? path.join(root, 'src', spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(from), spec) : null
    if (!base) return null
    return [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')].find((f) => existsSync(f) && f.match(/\.tsx?$/)) ?? null
  }

  it('imports nothing that pulls server-only', () => {
    const seen = new Map<string, string>()
    const queue = [path.join(root, 'src/lib/jobs/daily.ts')]
    const offenders: string[] = []
    while (queue.length) {
      const file = queue.shift()!
      const src = readFileSync(file, 'utf8')
      if (/^import ['"]server-only['"]/m.test(src)) offenders.push(path.relative(root, file))
      for (const [, spec] of src.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)) {
        const next = resolve(spec, file)
        if (next && !seen.has(next)) {
          seen.set(next, file)
          queue.push(next)
        }
      }
    }
    expect(offenders).toEqual([])
    expect(seen.size).toBeGreaterThan(5)
  })
})
