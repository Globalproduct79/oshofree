import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { MARKETS } from '@/lib/markets'
import { localMidnight, wallClock } from '@/lib/market-clock'
import { campaignSpendCents, creditSummary, invoiceStatus, nextInvoiceNumber } from '@/lib/money'
import { PLACEMENTS } from '@/lib/rates'
import { CPM_CENTS, FX_PER_USD } from '@/lib/reference-rates'
import { uploadDir } from '@/lib/upload-dir'
import { resetDb } from '../../scripts/db-truncate'
import { seed } from '../../prisma/seed'

// A day after the prototype's own (ADV "Seed campaigns" is relative to 13 Nov): the inventory's dates land a day on.
const NOW = new Date('2026-11-14T10:00:00Z')
const DAY = 86_400_000
const SLOW = 300_000
// The tests seed a fifth of the prototype's volumes (the default, 1, takes about two minutes).
const SCALE = 0.2

const STATUSES = {
  'Buy 2 get 1 — November': 'live',
  'August multipack 15% off': 'ended',
  'December draw teaser': 'review',
  'Supa10 Jackpot — Kenya': 'live',
  'Foot Gabal-Lena — Senegal': 'live',
  'Weekend cashback — Tanzania': 'review',
  'Kwik ₦1m draw': 'paused',
  'Jackpot 10 — Guinea-Bissau': 'ended',
  'KSh 50 cashback on first top-up': 'live',
}

const workspace = (name: string) => db.workspace.findFirstOrThrow({ where: { name } })

async function impressionsByCampaign(): Promise<Record<string, number>> {
  const campaigns = await db.campaign.findMany({ select: { id: true, name: true } })
  const rows = await db.channelEvent.groupBy({ by: ['campaignId'], where: { type: 'Impression' }, _count: { _all: true } })
  const n = new Map(rows.map((r) => [r.campaignId, r._count._all]))
  return Object.fromEntries(campaigns.map((c) => [c.name, n.get(c.id) ?? 0]))
}

// Each closeMonth invoice carries its own ledger lines, and its issue is audited under its number.
async function closedFromLedger(number: string) {
  const inv = await db.invoice.findUniqueOrThrow({ where: { number } })
  const { _sum, _count } = await db.ledgerEntry.aggregate({
    where: { invoiceId: inv.id, kind: { in: ['delivery', 'reward'] } }, _sum: { amountCents: true }, _count: { _all: true },
  })
  expect(_count._all, number).toBeGreaterThan(0)
  expect(-(_sum.amountCents ?? 0), number).toBe(inv.amountCents)
  const issued = await db.auditEvent.findFirstOrThrow({ where: { action: 'invoice.issue', targetId: inv.id } })
  expect((issued.after as { number?: string }).number, number).toBe(number)
  return inv
}

const isLocalMidnight = (at: Date, tz: string) => {
  const w = wallClock(tz, at)
  return w.hour === 0 && w.minute === 0 && w.second === 0 && at.getUTCMilliseconds() === 0
}

describe('seed', () => {
  it("builds the prototype's four workspaces, nine campaigns and their history through the real pipeline", async () => {
    const summary = await seed(NOW, { scale: SCALE })

    expect(await db.workspace.count()).toBe(4)
    expect(await db.user.count()).toBe(8)
    expect(await db.channel.count()).toBe(2)
    expect(await db.rateCard.count()).toBe(20)
    expect(await db.marketFx.count()).toBe(5)
    expect(await db.fraudRule.count()).toBe(3)
    expect(summary).toMatchObject({ users: 8, workspaces: 4, campaigns: 9 })

    const campaigns = await db.campaign.findMany({ include: { workspace: true } })
    expect(Object.fromEntries(campaigns.map((c) => [c.name, c.status]))).toEqual(STATUSES)
    for (const c of campaigns) {
      // Every campaign went through submit, so it carries the rate card's CPM and the market's FX.
      expect(c.cpmCents, c.name).toBe(CPM_CENTS[c.country][PLACEMENTS.indexOf(c.placement)])
      expect(Number(c.fxPerUsd), c.name).toBe(FX_PER_USD[c.country])
      // Flights start and end at the market's midnight.
      expect(isLocalMidnight(c.startsAt, MARKETS[c.country].timezone), c.name).toBe(true)
      expect(isLocalMidnight(c.endsAt, MARKETS[c.country].timezone), c.name).toBe(true)
      // No overspend: delivery and rewards together stay inside the budget.
      expect(await campaignSpendCents(c.id), c.name).toBeLessThanOrEqual(c.budgetUsd * 100)
    }
    const jackpot = campaigns.find((c) => c.name === 'Jackpot 10 — Guinea-Bissau')!
    expect(jackpot.country).toBe('SN')

    // Events sit inside each flight and before now; ended campaigns have nothing today; review has nothing.
    const today = (tz: string) => {
      const w = wallClock(tz, NOW)
      return localMidnight(tz, w.year, w.month, w.day)
    }
    for (const c of campaigns) {
      const span = await db.channelEvent.aggregate({ where: { campaignId: c.id }, _min: { at: true }, _max: { at: true }, _count: { _all: true } })
      if (c.status === 'review') {
        expect(span._count._all, c.name).toBe(0)
        continue
      }
      expect(span._count._all, c.name).toBeGreaterThan(0)
      expect(span._min.at!.getTime(), c.name).toBeGreaterThanOrEqual(c.startsAt.getTime())
      expect(span._max.at!.getTime(), c.name).toBeLessThan(Math.min(c.endsAt.getTime(), NOW.getTime()))
      if (c.status === 'ended' || c.status === 'paused') {
        expect(span._max.at!.getTime(), c.name).toBeLessThan(today(MARKETS[c.country].timezone).getTime())
      }
    }

    // Every Phoenix sharer has a phone of the campaign's market.
    const sharers = await db.shareLink.findMany({ where: { sharerType: 'Channel' }, include: { consumer: true, campaign: true } })
    expect(sharers.length).toBeGreaterThan(0)
    for (const s of sharers) expect(s.consumer?.phone.startsWith(`+${MARKETS[s.campaign.country].dial}`)).toBe(true)

    // Money came through the ledger: a delivery line per campaign and charged day, reward lines from payouts.
    expect(await db.ledgerEntry.count({ where: { kind: 'delivery', dedupeKey: { startsWith: 'delivery:' } } })).toBeGreaterThan(20)
    expect(await db.ledgerEntry.count({ where: { kind: 'reward' } })).toBeGreaterThan(0)
    // Held payouts for Global's queue, and a blocked one.
    expect(await db.rewardPayout.count({ where: { status: 'held', reason: 'phone_reuse' } })).toBeGreaterThan(0)
    expect(await db.rewardPayout.count({ where: { status: 'blocked', reason: 'same_device' } })).toBeGreaterThan(0)
    expect(await db.rewardPayout.count({ where: { status: 'sent' } })).toBeGreaterThan(0)
    expect(await db.aggregatorTopup.count({ where: { amountCents: 124000 } })).toBe(1)

    // Invoices: the inventory's numbers and statuses, each in its workspace's country.
    const kola = await workspace('Kola Bright')
    const media = await workspace('MediaSpec (agency)')
    const pesa = await workspace('Pesa Link')
    const sun = await workspace('SunFresh Juices')
    const invoices = await db.invoice.findMany({ include: { workspace: true }, orderBy: { number: 'asc' } })
    expect(invoices.map((i) => [i.number, i.workspace.name, invoiceStatus(i, NOW)])).toEqual([
      ['INV-0037', 'MediaSpec (agency)', 'paid'],
      ['INV-0041', 'Kola Bright', 'paid'],
      ['INV-0044', 'MediaSpec (agency)', 'due'],
      ['INV-0046', 'Pesa Link', 'overdue'],
    ])
    for (const i of invoices) expect(i.country).toBe(i.workspace.country)
    expect(await nextInvoiceNumber()).toBe('INV-0052')
    // Last month's invoices are closeMonth's: their amounts are the charges they carry.
    await closedFromLedger('INV-0041')
    await closedFromLedger('INV-0044')
    expect(await db.ledgerEntry.count({ where: { kind: 'payment', description: 'INV-0041 paid' } })).toBe(1)

    // Credit, roughly as ADV §14.
    const kolaCredit = await creditSummary(kola.id)
    expect(kolaCredit.inUseCents).toBeGreaterThanOrEqual(50000)
    expect(kolaCredit.inUseCents).toBeLessThanOrEqual(90000)
    expect(kolaCredit.limitCents).toBe(150000)
    expect((await creditSummary(media.id)).outstandingCents).toBeGreaterThan(0)
    expect((await creditSummary(media.id)).limitCents).toBe(800000)
    const pesaCredit = await creditSummary(pesa.id)
    expect(pesaCredit.outstandingCents).toBeGreaterThan(0)
    expect(pesaCredit.overLimit).toBe(false)
    expect(pesaCredit.inUseCents).toBeGreaterThan(pesaCredit.limitCents / 2)
    // Each running month shows its "(to date)" row.
    for (const ws of [kola, media, pesa]) expect((await creditSummary(ws.id)).unbilledCents, ws.name).toBeGreaterThan(0)

    // SunFresh waits for Global and says so.
    expect(sun.status).toBe('pending')
    expect(await db.campaign.count({ where: { workspaceId: sun.id } })).toBe(0)
    const kofi = await db.user.findUniqueOrThrow({ where: { email: 'kofi@sunfresh.demo' } })
    const awaiting = await db.notification.findFirstOrThrow({ where: { userId: kofi.id, workspaceId: sun.id, title: 'Your workspace is awaiting approval' } })
    expect(awaiting.readAt).toBeNull()

    // People and roles.
    const roles = await db.workspaceMember.findMany({ include: { user: true, workspace: true } })
    expect(roles.map((m) => `${m.workspace.name}:${m.user.email}:${m.role}`).sort()).toEqual([
      'Kola Bright:ada@kolabright.demo:Manager',
      'Kola Bright:tunde@kolabright.demo:Owner',
      'MediaSpec (agency):chidi@mediaspec.demo:Manager',
      'MediaSpec (agency):dolapo@mediaspec.demo:Owner',
      'MediaSpec (agency):kemi@mediaspec.demo:Viewer',
      'Pesa Link:wanjiru@pesalink.demo:Owner',
      'SunFresh Juices:kofi@sunfresh.demo:Owner',
    ])
    expect((await db.user.findUniqueOrThrow({ where: { email: 'admin@oshofree.demo' } })).isGlobalAdmin).toBe(true)

    // The bell: what the real paths said, dated when they said it.
    const tunde = await db.user.findUniqueOrThrow({ where: { email: 'tunde@kolabright.demo' } })
    const inReview = await db.notification.findFirstOrThrow({ where: { userId: tunde.id, title: 'December draw teaser is in review' } })
    expect(inReview.createdAt.getTime()).toBeLessThan(NOW.getTime())
    expect(inReview.createdAt.getTime()).toBeGreaterThan(NOW.getTime() - 2 * DAY)
    // The daily job's invoice duty said these, not the seed.
    const dolapo = await db.user.findUniqueOrThrow({ where: { email: 'dolapo@mediaspec.demo' } })
    expect(await db.notification.findFirst({ where: { userId: dolapo.id, title: 'INV-0044 is due in 5 days' } })).not.toBeNull()
    const wanjiru = await db.user.findUniqueOrThrow({ where: { email: 'wanjiru@pesalink.demo' } })
    expect(await db.notification.findFirst({ where: { userId: wanjiru.id, title: 'INV-0046 is overdue' } })).not.toBeNull()
    expect(await db.notification.count({ where: { title: { startsWith: 'INV-0041' } } })).toBe(0)
    // MediaSpec has the weekly digest on: the Monday runs sent it; Kola has it off.
    expect(await db.notification.count({ where: { userId: dolapo.id, kind: 'weekly' } })).toBeGreaterThan(0)
    expect(await db.notification.count({ where: { userId: tunde.id, kind: 'weekly' } })).toBe(0)
    expect(await db.notification.count({ where: { createdAt: { gt: NOW } } })).toBe(0)

    // The creatives went to the test uploads folder, not the dev server's.
    expect(uploadDir()).not.toBe(path.resolve('uploads'))
    const keys = campaigns.flatMap((c) => (c.creativeImageKey ? [c.creativeImageKey] : []))
    expect(keys).toHaveLength(4)
    for (const k of keys) expect(existsSync(path.join(uploadDir(), k)), k).toBe(true)

    const impressions = await impressionsByCampaign()
    expect(impressions['Buy 2 get 1 — November']).toBeGreaterThan(0)
    expect(impressions['December draw teaser']).toBe(0)

    await expect(seed(NOW, { scale: SCALE })).rejects.toThrow(/Refusing to seed/)
  }, SLOW)

  it('is a pure function of now: two runs on empty databases deliver the same impressions', async () => {
    await seed(NOW, { scale: SCALE })
    const first = await impressionsByCampaign()
    expect(Object.keys(first)).toHaveLength(9)
    await resetDb()
    await seed(NOW, { scale: SCALE })
    expect(await impressionsByCampaign()).toEqual(first)
  }, SLOW)

  it('closes last month for Kola Bright and MediaSpec on a late-month run day too', async () => {
    const late = new Date('2026-11-27T09:00:00Z')
    await seed(late, { scale: 0.05 })
    const invoices = await db.invoice.findMany({ include: { workspace: true }, orderBy: { number: 'asc' } })
    expect(invoices.map((i) => [i.number, i.workspace.name, i.status])).toEqual([
      ['INV-0037', 'MediaSpec (agency)', 'paid'],
      ['INV-0041', 'Kola Bright', 'paid'],
      ['INV-0044', 'MediaSpec (agency)', 'due'],
      ['INV-0046', 'Pesa Link', 'due'],
    ])
    expect(invoiceStatus(invoices[3], late)).toBe('overdue')
    expect(await nextInvoiceNumber()).toBe('INV-0052')
    // Both are October's, closed from the ended campaigns' October charges.
    for (const n of ['INV-0041', 'INV-0044']) {
      const inv = await closedFromLedger(n)
      expect(inv.period.toISOString(), n).toBe('2026-09-30T23:00:00.000Z')
    }
    const kola = await creditSummary((await workspace('Kola Bright')).id)
    expect(kola.inUseCents).toBeGreaterThanOrEqual(50000)
    expect(kola.inUseCents).toBeLessThanOrEqual(90000)
    const statuses = await db.campaign.findMany({ select: { name: true, status: true } })
    expect(Object.fromEntries(statuses.map((c) => [c.name, c.status]))).toEqual(STATUSES)
  }, SLOW)
})

// `npm run db:seed` and `npm run test:e2e` run the seed under tsx, where `server-only` does not resolve.
describe('the seed under tsx', () => {
  const root = path.resolve(import.meta.dirname, '../..')
  const resolve = (spec: string, from: string): string | null => {
    const base = spec.startsWith('@/') ? path.join(root, 'src', spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(from), spec) : null
    if (!base) return null
    return [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')].find((f) => existsSync(f) && f.match(/\.tsx?$/)) ?? null
  }

  it('imports nothing that pulls server-only', () => {
    const seen = new Set<string>()
    const queue = [path.join(root, 'prisma/seed.ts')]
    const offenders: string[] = []
    while (queue.length) {
      const file = queue.shift()!
      const src = readFileSync(file, 'utf8')
      if (/^import ['"]server-only['"]/m.test(src)) offenders.push(path.relative(root, file))
      for (const [, spec] of src.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)) {
        const next = resolve(spec, file)
        if (next && !seen.has(next)) {
          seen.add(next)
          queue.push(next)
        }
      }
    }
    expect(offenders).toEqual([])
    expect(seen.size).toBeGreaterThan(10)
  })
})
