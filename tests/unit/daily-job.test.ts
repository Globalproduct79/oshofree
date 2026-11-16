import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { ChannelEventType, NotificationKind, Prisma } from '@prisma/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runDailyJobAction } from '@/app/admin/review/actions'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { endCampaign } from '@/lib/campaigns'
import { INVOICE_LOCK, invoiceStatus } from '@/lib/money'
import { chargeDay, previousMarketDay, runDaily } from '@/lib/jobs/daily'
import { jobDay } from '../../scripts/daily'

vi.mock('@/lib/auth', () => ({ auth: vi.fn(), signOut: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
// The real payouts and ledger, unless a test switches the aggregator off or fails one campaign's line.
const aggregator = vi.hoisted(() => ({ down: false }))
const ledger = vi.hoisted(() => ({ failFor: null as string | null }))
vi.mock('@/lib/money', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/money')>()
  return {
    ...real,
    postLedger: async (...args: Parameters<typeof real.postLedger>) => {
      if (args[1].campaignId && args[1].campaignId === ledger.failFor) throw new Error('ledger down')
      return real.postLedger(...args)
    },
  }
})
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

async function queuedPayout(workspaceId: string, campaignId: string, channelId: string) {
  const link = await db.shareLink.create({ data: { code: `ROOT${++seq}`, campaignId, channelId, depth: 0, sharerType: 'Root' } })
  await db.aggregatorAccount.upsert({ where: { id: 'reloadly' }, create: { id: 'reloadly', balanceCents: 1000 }, update: {} })
  return db.rewardPayout.create({
    data: { campaignId, workspaceId, shareLinkId: link.id, claimEventKey: `claim-${seq}`, amountLocal: 50, amountCents: 3, status: 'queued' },
  })
}

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

  it("raises a day's line to the day's total when more impressions arrive after it was charged", async () => {
    const { ws, phoenix } = await world()
    const c = await campaign(ws.id)
    await events(phoenix.id, c.id, 'Impression', 1000, '2026-11-10T12:00:00Z')
    await runDaily(at('2026-11-10T12:00:00Z'), at('2026-11-11T02:00:00Z'))
    await events(phoenix.id, c.id, 'Impression', 500, '2026-11-10T15:00:00Z')

    expect(await runDaily(at('2026-11-10T12:00:00Z'), at('2026-11-11T09:00:00Z'), { replay: true })).toMatchObject({ charged: 1 })
    const rows = await deliveries(c.id)
    expect(rows).toHaveLength(1)
    // 1,500 impressions × 120 ¢ ÷ 1,000, on the day's one line.
    expect(rows[0]).toMatchObject({ amountCents: -180, dedupeKey: `delivery:${c.id}:2026-11-10` })
    // Nothing new: a replay changes nothing.
    expect(await runDaily(at('2026-11-10T12:00:00Z'), at('2026-11-11T10:00:00Z'), { replay: true })).toMatchObject({ charged: 0 })
    expect((await deliveries(c.id)).map((r) => r.amountCents)).toEqual([-180])
  })

  it("leaves an invoiced line as it was and charges the rest of that day on a line of its own", async () => {
    const { ws, phoenix } = await world()
    const c = await campaign(ws.id)
    await events(phoenix.id, c.id, 'Impression', 1000, '2026-11-10T12:00:00Z')
    await runDaily(at('2026-11-10T12:00:00Z'), at('2026-11-11T02:00:00Z'))
    const invoice = await db.invoice.create({
      data: {
        workspaceId: ws.id, number: 'INV-0052', period: at('2026-10-31T23:00:00Z'), amountCents: 120, fxPerUsd: 1550, country: 'NG',
        status: 'due', issuedAt: at('2026-12-01T02:00:00Z'), dueAt: at('2026-12-15T02:00:00Z'),
      },
    })
    await db.ledgerEntry.updateMany({ where: { campaignId: c.id, kind: 'delivery' }, data: { invoiceId: invoice.id } })
    await events(phoenix.id, c.id, 'Impression', 500, '2026-11-10T15:00:00Z')

    await runDaily(at('2026-11-10T12:00:00Z'), at('2026-11-11T09:00:00Z'), { replay: true })
    const rows = (await deliveries(c.id)).sort((a, b) => a.dedupeKey!.localeCompare(b.dedupeKey!))
    expect(rows).toMatchObject([
      { amountCents: -120, invoiceId: invoice.id, dedupeKey: `delivery:${c.id}:2026-11-10` },
      { amountCents: -60, invoiceId: null, dedupeKey: `delivery:${c.id}:2026-11-10:1` },
    ])
    await runDaily(at('2026-11-10T12:00:00Z'), at('2026-11-11T10:00:00Z'), { replay: true })
    expect(await deliveries(c.id)).toHaveLength(2)
  })

  // A day charged once (1,000 impressions, −120 ¢), its line as the next charge reads it, and the invoice a close
  // would put it on.
  async function chargedDay() {
    const { ws, phoenix } = await world()
    const c = await campaign(ws.id)
    await events(phoenix.id, c.id, 'Impression', 1000, '2026-11-10T12:00:00Z')
    await runDaily(at('2026-11-10T12:00:00Z'), at('2026-11-11T02:00:00Z'))
    const key = `delivery:${c.id}:2026-11-10`
    const read = await db.ledgerEntry.findMany({ where: { dedupeKey: key }, select: { id: true, amountCents: true, invoiceId: true } })
    const invoice = await db.invoice.create({
      data: {
        workspaceId: ws.id, number: 'INV-0052', period: at('2026-10-31T23:00:00Z'), amountCents: 120, fxPerUsd: 1550, country: 'NG',
        status: 'due', issuedAt: at('2026-12-01T02:00:00Z'), dueAt: at('2026-12-15T02:00:00Z'),
      },
    })
    const lines = async () =>
      (await deliveries(c.id)).sort((a, b) => a.dedupeKey!.localeCompare(b.dedupeKey!)).map((l) => ({ amountCents: l.amountCents, invoiceId: l.invoiceId, dedupeKey: l.dedupeKey }))
    return { c, key, read, invoice, lines }
  }

  it('looks again before raising a line: one a close invoiced after it was read keeps its amount, and the rest is a line of its own', async () => {
    const { c, key, read, invoice, lines } = await chargedDay()
    expect(read).toMatchObject([{ amountCents: -120, invoiceId: null }])
    await db.ledgerEntry.updateMany({ where: { dedupeKey: key }, data: { invoiceId: invoice.id } })

    expect(await chargeDay(c, key, read, 180, at('2026-11-10T22:59:59Z'))).toBe(true)
    expect(await lines()).toEqual([
      { amountCents: -120, invoiceId: invoice.id, dedupeKey: key },
      { amountCents: -60, invoiceId: null, dedupeKey: `${key}:1` },
    ])
  })

  it("waits for a close that holds the invoice lock, so the invoice and its lines never disagree", async () => {
    const { c, key, read, invoice, lines } = await chargedDay()
    let locked!: () => void
    let release!: () => void
    const isLocked = new Promise<void>((r) => (locked = r))
    const released = new Promise<void>((r) => (release = r))
    // A close mid-way: it has the lock and has read the line at −120; it tags the line once released.
    const close = db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${INVOICE_LOCK}::bigint)`
      locked()
      await released
      await tx.ledgerEntry.updateMany({ where: { dedupeKey: key }, data: { invoiceId: invoice.id } })
    }, { timeout: 10_000 })
    await isLocked

    const charging = chargeDay(c, key, read, 180, at('2026-11-10T22:59:59Z'))
    await new Promise((r) => setTimeout(r, 300))
    expect((await deliveries(c.id)).map((l) => l.amountCents)).toEqual([-120])
    release()
    await close
    await charging
    expect(await lines()).toEqual([
      { amountCents: -120, invoiceId: invoice.id, dedupeKey: key },
      { amountCents: -60, invoiceId: null, dedupeKey: `${key}:1` },
    ])
  })

  it("lists one campaign's failed charge and carries on: the others are charged and the payouts sent", async () => {
    const { ws, phoenix } = await world()
    const broken = await campaign(ws.id)
    const fine = await campaign(ws.id, { name: 'Weekend cashback' })
    await events(phoenix.id, broken.id, 'Impression', 1000, '2026-11-10T12:00:00Z')
    await events(phoenix.id, fine.id, 'Impression', 1000, '2026-11-10T12:00:00Z')
    const payout = await queuedPayout(ws.id, broken.id, phoenix.id)
    ledger.failFor = broken.id
    try {
      const summary = await runDaily(at('2026-11-10T12:00:00Z'))
      expect(summary).toMatchObject({ skipped: false, charged: 1, payouts: 1 })
      expect(!summary.skipped && summary.errors).toEqual([{ duty: 'charge', campaignId: broken.id, message: 'ledger down' }])
    } finally {
      ledger.failFor = null
    }
    expect(await deliveries(broken.id)).toEqual([])
    expect(await deliveries(fine.id)).toHaveLength(1)
    expect(await db.rewardPayout.findUniqueOrThrow({ where: { id: payout.id } })).toMatchObject({ status: 'sent' })
  })

  it('keeps the day when a duty fails, runs the later duties, and a replay finishes it charging nothing twice', async () => {
    const { ws, phoenix } = await world()
    const c = await campaign(ws.id, { startsAt: at('2026-11-03T12:00:00Z'), endsAt: at('2026-11-17T12:00:00Z') })
    await spent(ws.id, c.id, 24_000) // fast: pace runs after payouts
    await events(phoenix.id, c.id, 'Impression', 1000, '2026-11-10T12:00:00Z')
    const payout = await queuedPayout(ws.id, c.id, phoenix.id)
    aggregator.down = true
    try {
      const summary = await runDaily(at('2026-11-10T12:00:00Z'))
      expect(summary).toMatchObject({ skipped: false, charged: 1, payouts: 0, pace: 1 })
      expect(!summary.skipped && summary.errors).toEqual([{ duty: 'payouts', message: 'aggregator down' }])
    } finally {
      aggregator.down = false
    }
    expect(await db.jobRun.count({ where: { name: 'daily' } })).toBe(1)
    expect(await runDaily(at('2026-11-10T13:00:00Z'))).toEqual({ skipped: true })
    expect(await runDaily(at('2026-11-10T13:00:00Z'), undefined, { replay: true })).toMatchObject({ skipped: false, payouts: 1, errors: [] })
    expect(await deliveries(c.id)).toHaveLength(1)
    expect(await db.rewardPayout.findUniqueOrThrow({ where: { id: payout.id } })).toMatchObject({ status: 'sent' })
  })

  it('dates a charge inside the day it charges when the job runs the next morning', async () => {
    const { ws, phoenix } = await world()
    const c = await campaign(ws.id)
    await events(phoenix.id, c.id, 'Impression', 1000, '2026-11-10T12:00:00Z')
    await runDaily(at('2026-11-10T12:00:00Z'), at('2026-11-11T02:00:00Z'))
    const [row] = await deliveries(c.id)
    expect(row).toMatchObject({ amountCents: -120, at: at('2026-11-10T22:59:59.999Z') })
  })

  it('charges nothing without impressions or without a CPM snapshot', async () => {
    const { ws, phoenix } = await world()
    const quiet = await campaign(ws.id)
    const unpriced = await campaign(ws.id, { name: 'Unpriced', cpmCents: null })
    await events(phoenix.id, unpriced.id, 'Impression', 1000, '2026-11-10T12:00:00Z')
    expect(await runDaily(at('2026-11-10T12:00:00Z'))).toMatchObject({ charged: 0 })
    expect(await db.ledgerEntry.count()).toBe(0)
    expect(await statusOf(quiet.id)).toBe('live')
  })

  it("charges the day's impressions whatever the status now: paused by the advertiser or ended mid-day", async () => {
    const { ws, owner, phoenix } = await world()
    const paused = await campaign(ws.id, { name: 'Paused', status: 'paused', pausedBy: 'user' })
    const ended = await campaign(ws.id, { name: 'Ended early' })
    await events(phoenix.id, paused.id, 'Impression', 1000, '2026-11-10T09:00:00Z')
    await events(phoenix.id, ended.id, 'Impression', 500, '2026-11-10T09:00:00Z')
    await endCampaign(ended.id, owner.id, at('2026-11-10T15:00:00Z'))

    expect(await runDaily(at('2026-11-10T12:00:00Z'), at('2026-11-11T02:00:00Z'))).toMatchObject({ charged: 2 })
    expect((await deliveries(paused.id)).map((r) => r.amountCents)).toEqual([-120])
    expect((await deliveries(ended.id)).map((r) => r.amountCents)).toEqual([-60])
  })

  it('charges a campaign the previous run paused over credit for the hours it ran that day', async () => {
    const { ws, phoenix } = await world({ limitCents: 10_000 })
    const c = await campaign(ws.id)
    await events(phoenix.id, c.id, 'Impression', 1000, '2026-11-10T00:30:00Z') // 01:30 on 10 Nov in Lagos
    // 02:00 UTC on 10 Nov: the run for 9 Nov pauses it.
    expect(await runDaily(at('2026-11-09T12:00:00Z'), at('2026-11-10T02:00:00Z'))).toMatchObject({ charged: 0, paused: 1 })
    expect(await statusOf(c.id)).toBe('paused')
    // The next morning's run for 10 Nov charges the impressions it got before the pause.
    expect(await runDaily(at('2026-11-10T12:00:00Z'), at('2026-11-11T02:00:00Z'))).toMatchObject({ charged: 1 })
    expect((await deliveries(c.id)).map((r) => r.amountCents)).toEqual([-120])
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
    const p = await queuedPayout(ws.id, c.id, phoenix.id)
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

  it('sends the weekly digest at the 02:00 UTC run on Monday in the market, once', async () => {
    const { ws } = await week()
    // 03:00 on Monday in Lagos: the documented cron.
    expect(await runDaily(at('2026-11-15T12:00:00Z'), at('2026-11-16T02:00:00Z'))).toMatchObject({ weekly: 1 })
    expect(await runDaily(at('2026-11-16T12:00:00Z'), at('2026-11-16T09:00:00Z'))).toMatchObject({ weekly: 0 })
    const told = await notes('weekly')
    expect(told).toHaveLength(1)
    expect(told[0]).toMatchObject({ workspaceId: ws.id, title: 'Your week on Phoenix', detail: '1 live · 1.5k impressions · $12 spent' })
  })

  it('sends no digest on another day of the week', async () => {
    await week()
    expect(await runDaily(at('2026-11-15T22:59:00Z'))).toMatchObject({ weekly: 0 }) // 23:59 on Sunday in Lagos
    expect(await runDaily(at('2026-11-17T09:00:00Z'))).toMatchObject({ weekly: 0 }) // Tuesday
    expect(await notes('weekly')).toEqual([])
  })
})

// A $12 invoice issued on 1 Nov, due at 02:00 UTC on 15 Nov.
const invoiceFor = (workspaceId: string, number: string, status: 'due' | 'paid' = 'due') =>
  db.invoice.create({
    data: {
      workspaceId, number, period: at('2026-10-31T23:00:00Z'), amountCents: 1200, fxPerUsd: 1550, country: 'NG',
      status, issuedAt: at('2026-11-01T02:00:00Z'), dueAt: at('2026-11-15T02:00:00Z'),
    },
  })

async function unpaid() {
  const w = await world()
  return { ...w, invoice: await invoiceFor(w.ws.id, 'INV-0052') }
}

describe('runDaily — invoices', () => {
  it('tells the workspace once, five days or less before an invoice is due', async () => {
    const { ws, owner } = await unpaid()
    expect(await runDaily(at('2026-11-08T12:00:00Z'), at('2026-11-09T02:00:00Z'))).toMatchObject({ invoices: 0 }) // six days
    expect(await runDaily(at('2026-11-09T12:00:00Z'), at('2026-11-10T02:00:00Z'))).toMatchObject({ invoices: 1 })
    expect(await runDaily(at('2026-11-10T12:00:00Z'), at('2026-11-11T02:00:00Z'))).toMatchObject({ invoices: 0 })
    expect(await notes('credit')).toMatchObject([{
      userId: owner.id, workspaceId: ws.id, title: 'INV-0052 is due in 5 days', detail: '$12 · pay by bank transfer', href: '/app/invoices',
    }])
  })

  it('says once that an unpaid invoice is overdue from its due date, to members with the credit toggle on', async () => {
    const { ws, owner, invoice } = await unpaid()
    const viewer = await db.user.create({ data: { email: 'ada@x.test', name: 'Ada', passwordHash: 'x' } })
    await db.workspaceMember.create({ data: { userId: viewer.id, workspaceId: ws.id, role: 'Viewer' } })
    await db.notificationPref.create({ data: { userId: viewer.id, workspaceId: ws.id, kind: 'credit', enabled: false } })

    expect(await runDaily(at('2026-11-14T12:00:00Z'), at('2026-11-15T02:00:00Z'))).toMatchObject({ invoices: 1 })
    expect(await runDaily(at('2026-11-15T12:00:00Z'), at('2026-11-16T02:00:00Z'))).toMatchObject({ invoices: 0 })
    const told = await notes('credit')
    expect(told).toMatchObject([{ userId: owner.id, title: 'INV-0052 is overdue', detail: '$12 · was due 15 Nov', href: '/app/invoices' }])
    // Overdue is a due invoice past its date (money.invoiceStatus): it still counts as outstanding.
    expect(invoiceStatus(await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } }), at('2026-11-16T02:00:00Z'))).toBe('overdue')
  })

  it('says nothing about a paid invoice, or to a workspace that is not approved', async () => {
    const { ws } = await world()
    await invoiceFor(ws.id, 'INV-0052', 'paid')
    const other = await db.user.create({ data: { email: 'kofi@x.test', name: 'Kofi', passwordHash: 'x' } })
    const declined = await db.workspace.create({
      data: { name: 'SunFresh', type: 'Brand', country: 'NG', status: 'declined', members: { create: { userId: other.id, role: 'Owner' } } },
    })
    await invoiceFor(declined.id, 'INV-0053')
    await runDaily(at('2026-11-12T12:00:00Z'), at('2026-11-13T02:00:00Z'))
    await runDaily(at('2026-11-15T12:00:00Z'), at('2026-11-16T02:00:00Z'))
    expect(await notes('credit')).toEqual([])
  })
})

describe('runDailyJobAction', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

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

  it('is the cron run: the market day that has just finished, replayed past the guard on every click', async () => {
    vi.stubEnv('DEMO_CONTROLS', '1')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(at('2026-11-11T14:00:00Z'))
    await signIn(true)
    const { ws, phoenix } = await world()
    const c = await campaign(ws.id)
    await events(phoenix.id, c.id, 'Impression', 1000, '2026-11-10T12:00:00Z')
    // The 02:00 UTC cron already ran the day.
    expect(await runDaily(previousMarketDay(at('2026-11-11T02:00:00Z')), at('2026-11-11T02:00:00Z'))).toMatchObject({ charged: 1 })
    // A late batch for 10 Nov, and today's impressions, which no run charges until today is over.
    await events(phoenix.id, c.id, 'Impression', 500, '2026-11-10T20:00:00Z')
    await events(phoenix.id, c.id, 'Impression', 400, '2026-11-11T09:00:00Z')

    expect(await runDailyJobAction()).toMatchObject({ ok: true, summary: { skipped: false, charged: 1, errors: [] } })
    // 1,500 impressions × 120 ¢ ÷ 1,000: the day's one line, raised to its total.
    expect(await deliveries(c.id)).toMatchObject([{ amountCents: -180, dedupeKey: `delivery:${c.id}:2026-11-10` }])
    expect(await runDailyJobAction()).toMatchObject({ ok: true, summary: { skipped: false, charged: 0 } })
    expect(await deliveries(c.id)).toHaveLength(1)
    const runs = await db.jobRun.findMany({ where: { name: 'daily' } })
    expect(runs.map((r) => r.day)).toEqual([at('2026-11-10T00:00:00Z')])

    // Each click is recorded, like "Simulate a day" (Prompt 9): who ran the job, on which run, and what it did — its
    // errors too, which the toast only counts.
    const admin = await db.user.findFirstOrThrow({ where: { isGlobalAdmin: true } })
    const audits = await db.auditEvent.findMany({ where: { action: 'demo.runDaily' } })
    expect(audits).toHaveLength(2)
    for (const a of audits) expect(a).toMatchObject({ actorId: admin.id, targetType: 'JobRun', targetId: runs[0].id, workspaceId: null })
    expect(audits.map((a) => a.after)).toEqual(
      expect.arrayContaining([expect.objectContaining({ charged: 1, errors: [] }), expect.objectContaining({ charged: 0, errors: [] })]),
    )
  })

  it('records nothing when refused', async () => {
    vi.stubEnv('DEMO_CONTROLS', '')
    await signIn(true)
    await runDailyJobAction()
    expect(await db.auditEvent.count()).toBe(0)
  })
})

describe('scripts/daily.ts — the day to run', () => {
  const now = at('2026-11-14T02:00:00Z')

  it('runs the day that just ended without an argument, under the guard', () => {
    expect(jobDay(undefined, now)).toEqual({ day: at('2026-11-13T02:00:00Z'), replay: false })
  })

  it('replays a YYYY-MM-DD day past the guard, at noon UTC inside it', () => {
    expect(jobDay('2026-11-10', now)).toEqual({ day: at('2026-11-10T12:00:00Z'), replay: true })
    expect(jobDay('2026-11-13', now)).toEqual({ day: at('2026-11-13T12:00:00Z'), replay: true })
  })

  it('refuses anything but a real date, and a day not over in every market', () => {
    for (const bad of ['2026-11-1', '10/11/2026', '2026-02-30', '2026-13-01', 'yesterday', ''])
      expect(() => jobDay(bad, now)).toThrow('is not a date. Give the day as YYYY-MM-DD.')
    expect(() => jobDay('2026-11-14', now)).toThrow('2026-11-14 is not over in every market yet.')
  })
})

// `npm run job:daily` and `npm run bootstrap` run under tsx, where `server-only` does not resolve: nothing they
// import may pull it.
describe('the scripts under tsx', () => {
  const root = path.resolve(import.meta.dirname, '../..')
  const resolve = (spec: string, from: string): string | null => {
    const base = spec.startsWith('@/') ? path.join(root, 'src', spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(from), spec) : null
    if (!base) return null
    return [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')].find((f) => existsSync(f) && f.match(/\.tsx?$/)) ?? null
  }

  it.each(['scripts/daily.ts', 'scripts/bootstrap.ts'])('%s imports nothing that pulls server-only', (entry) => {
    const seen = new Map<string, string>()
    const queue = [path.join(root, entry)]
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
