import type { LedgerKind } from '@prisma/client'
import { SYSTEM_ACTOR } from '@/lib/audit'
import { ymd } from '@/lib/campaign-schema'
import { campaignFacts, endCampaign, PACE_BAND, pauseOverCredit, startScheduled } from '@/lib/campaigns'
import { MONEY } from '@/lib/copy-money'
import { NOTIFY } from '@/lib/copy-notifications'
import { db } from '@/lib/db'
import { pct } from '@/lib/format'
import { COUNTRIES, MARKETS, type Country } from '@/lib/markets'
import { dayBounds, localMidnight, wallClock } from '@/lib/market-clock'
import { closeMonth, postLedger, spendByCampaign } from '@/lib/money'
import { notifyWorkspace } from '@/lib/notifications'
import { sendQueuedPayouts } from '@/lib/rewards'

// The daily job (spec §6.7). Nothing here may import `server-only`: `npm run job:daily` runs it under tsx.
//
// `day` picks the market-local day whose impressions are charged and keys the once-a-day guard; every
// other duty acts at `now`. In order: (1) delivery charges, (2) ends, (3) starts, (4) credit pauses,
// (5) payouts, (6) the month close on the 1st and 2nd, (7) pace warnings, (8) Monday's digest.

const DAILY = 'daily'
const DAY_MS = 86_400_000
const DIGEST_HOUR = 8
const CHARGES: LedgerKind[] = ['delivery', 'reward']

export type MonthClose = 'closed' | 'skipped' | 'not_over' | 'no_fx'

export type DailySummary = {
  charged: number
  ended: number
  started: number
  paused: number
  payouts: number
  monthClose: MonthClose
  pace: number
  weekly: number
}

export type DailyResult = ({ skipped: false } & DailySummary) | { skipped: true }

const campaignHref = (id: string) => `/app/campaigns/${id}`
const utcDate = (at: Date) => new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()))

// The market's calendar date at `at`, as the UTC midnight a JobRun day stores.
function marketDate(country: Country, at: Date): Date {
  const { year, month, day } = wallClock(MARKETS[country].timezone, at)
  return new Date(Date.UTC(year, month, day))
}

// True for the first caller only: the insert is ON CONFLICT DO NOTHING on (name, day).
async function claim(name: string, day: Date): Promise<boolean> {
  const { count } = await db.jobRun.createMany({ data: [{ name, day }], skipDuplicates: true })
  return count === 1
}

export async function runDaily(day: Date, now: Date = day): Promise<DailyResult> {
  const key = utcDate(day)
  if (!(await claim(DAILY, key))) return { skipped: true }
  try {
    const charged = await chargeDelivery(day, now)
    const ended = await endFinished(now)
    const started = (await startScheduled(now)).length
    const paused = await pauseOverLimit()
    const { sent: payouts } = await sendQueuedPayouts(now)
    const monthClose = await closeLastMonth(now)
    const pace = await warnPace(now)
    const weekly = await weeklyDigests(now)
    return { skipped: false, charged, ended, started, paused, payouts, monthClose, pace, weekly }
  } catch (e) {
    // Every duty is idempotent on its own, so a failed run gives its day back to be run again. The run's
    // own error is the one reported.
    await db.jobRun.deleteMany({ where: { name: DAILY, day: key } }).catch(() => undefined)
    throw e
  }
}

// (1) Each live campaign's impressions in its market's day × its CPM snapshot, never past what is left of
// its budget. One grouped count per market; the line is dated inside the day it charges.
async function chargeDelivery(day: Date, now: Date): Promise<number> {
  const live = await db.campaign.findMany({
    where: { status: 'live', cpmCents: { not: null } },
    select: { id: true, name: true, workspaceId: true, country: true, budgetUsd: true, cpmCents: true },
  })
  const spend = await spendByCampaign(live.map((c) => c.id))
  let charged = 0
  for (const country of COUNTRIES) {
    const here = live.filter((c) => c.country === country)
    if (!here.length) continue
    const { start, end } = dayBounds(country, day)
    const counts = await db.channelEvent.groupBy({
      by: ['campaignId'],
      where: { campaignId: { in: here.map((c) => c.id) }, type: 'Impression', at: { gte: start, lt: end } },
      _count: { _all: true },
    })
    const impressions = new Map(counts.map((r) => [r.campaignId, r._count._all]))
    const at = new Date(Math.min(now.getTime(), end.getTime() - 1))
    const date = ymd(day, country)
    for (const c of here) {
      const left = c.budgetUsd * 100 - (spend.get(c.id) ?? 0)
      const cents = Math.min(Math.round(((impressions.get(c.id) ?? 0) * c.cpmCents!) / 1000), left)
      if (cents <= 0) continue
      await postLedger(c.workspaceId, {
        at, description: MONEY.deliveryLine(c.name), amountCents: -cents, kind: 'delivery', campaignId: c.id,
        dedupeKey: `delivery:${c.id}:${date}`,
      })
      charged++
    }
  }
  return charged
}

// (2) Live and paused campaigns end — only through endCampaign — once their budget is spent or their end
// date has arrived in their market.
async function endFinished(now: Date): Promise<number> {
  const running = await db.campaign.findMany({
    where: { status: { in: ['live', 'paused'] } },
    select: { id: true, name: true, workspaceId: true, country: true, budgetUsd: true, endsAt: true },
  })
  const spend = await spendByCampaign(running.map((c) => c.id))
  let ended = 0
  for (const c of running) {
    const outOfBudget = (spend.get(c.id) ?? 0) >= c.budgetUsd * 100
    const flightOver = now >= dayBounds(c.country, c.endsAt).start
    if (!outOfBudget && !flightOver) continue
    try {
      await endCampaign(c.id, SYSTEM_ACTOR, now)
    } catch (e) {
      if (e === 'INVALID_TRANSITION') continue
      throw e
    }
    ended++
    const told = outOfBudget ? NOTIFY.ended(c.name, 0, '', true) : await endedWithReach(c.id, c.name)
    await notifyWorkspace(c.workspaceId, 'ended', told.title, told.detail, campaignHref(c.id))
  }
  return ended
}

async function endedWithReach(campaignId: string, name: string) {
  const rows = await db.channelEvent.groupBy({
    by: ['type'], where: { campaignId, type: { in: ['Impression', 'Open'] } }, _count: { _all: true },
  })
  const count = (type: string) => rows.find((r) => r.type === type)?._count._all ?? 0
  return NOTIFY.ended(name, count('Impression'), pct(count('Open'), count('Impression')))
}

// (4) Workspaces with something live are checked against their limit.
async function pauseOverLimit(): Promise<number> {
  const workspaces = await db.campaign.findMany({ where: { status: 'live' }, distinct: ['workspaceId'], select: { workspaceId: true } })
  let paused = 0
  for (const { workspaceId } of workspaces) paused += (await pauseOverCredit(workspaceId)).length
  return paused
}

// (6) On the 1st and 2nd (UTC) the previous month is closed, after the day's charges are posted. The 2nd
// retries a 1st that failed; closeMonth is idempotent per month.
async function closeLastMonth(now: Date): Promise<MonthClose> {
  if (now.getUTCDate() > 2) return 'skipped'
  try {
    await closeMonth(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15)), SYSTEM_ACTOR, now)
    return 'closed'
  } catch (e) {
    if (e === 'MONTH_NOT_OVER') return 'not_over'
    if (e === 'NO_FX') return 'no_fx'
    throw e
  }
}

// (7) A live campaign off pace is flagged once per market day to members with the `pace` toggle on. At a
// steady rate the budget lasts flight ÷ pace, so it lands flight × |1 ÷ pace − 1| from the end. A campaign
// with nothing charged yet has no rate to project.
async function warnPace(now: Date): Promise<number> {
  const live = await db.campaign.findMany({
    where: { status: 'live' },
    select: { id: true, name: true, workspaceId: true, country: true, startsAt: true, endsAt: true },
  })
  let warned = 0
  for (const c of live) {
    const { pace, spendCents } = await campaignFacts(c.id, now)
    if (spendCents === 0 || (pace >= PACE_BAND.slow && pace <= PACE_BAND.fast)) continue
    if (!(await claim(`pace:${c.id}`, marketDate(c.country, now)))) continue
    const flightDays = (c.endsAt.getTime() - c.startsAt.getTime()) / DAY_MS
    const days = Math.max(1, Math.round(flightDays * Math.abs(1 / pace - 1)))
    const told = pace > PACE_BAND.fast ? NOTIFY.paceFast(c.name, days) : NOTIFY.paceSlow(c.name, days)
    await notifyWorkspace(c.workspaceId, 'pace', told.title, told.detail, campaignHref(c.id))
    warned++
  }
  return warned
}

// (8) From 08:00 on Monday in its market, each approved workspace with anything to report gets the last
// Monday-to-Sunday — once a week, to members with the `weekly` toggle on.
async function weeklyDigests(now: Date): Promise<number> {
  const workspaces = await db.workspace.findMany({ where: { status: 'approved' }, select: { id: true, country: true } })
  let sent = 0
  for (const ws of workspaces) {
    const timeZone = MARKETS[ws.country].timezone
    const { year, month, day, hour } = wallClock(timeZone, now)
    const monday = new Date(Date.UTC(year, month, day))
    if (monday.getUTCDay() !== 1 || hour < DIGEST_HOUR) continue
    if (!(await claim(`weekly:${ws.id}`, monday))) continue
    const week = { gte: localMidnight(timeZone, year, month, day - 7), lt: localMidnight(timeZone, year, month, day) }
    const [live, impressions, charges] = await Promise.all([
      db.campaign.count({ where: { workspaceId: ws.id, status: 'live' } }),
      db.channelEvent.count({ where: { type: 'Impression', at: week, campaign: { workspaceId: ws.id } } }),
      db.ledgerEntry.aggregate({ where: { workspaceId: ws.id, kind: { in: CHARGES }, at: week }, _sum: { amountCents: true } }),
    ])
    const spendCents = charges._sum.amountCents ? -charges._sum.amountCents : 0
    if (!live && !impressions && !spendCents) continue
    const told = NOTIFY.weekly(live, impressions, spendCents)
    await notifyWorkspace(ws.id, 'weekly', told.title, told.detail, '/app')
    sent++
  }
  return sent
}
