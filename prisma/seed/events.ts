import type { Campaign } from '@prisma/client'
import { pauseCampaign } from '@/lib/campaigns'
import { db } from '@/lib/db'
import { generateDay } from '@/lib/demo/generator'
import type { Rng } from '@/lib/demo/prng'
import { CampaignDay, type Window } from '@/lib/demo/simulate-day'
import { runDaily } from '@/lib/jobs/daily'
import { leaveDetails, recordClaim, recordOpen } from '@/lib/link-events'
import { dayBounds } from '@/lib/market-clock'
import { MARKETS } from '@/lib/markets'
import { campaignSpendCents } from '@/lib/money'
import { shareOffer } from '@/lib/offers'
import { CAMPAIGNS, type Made, type SeedCampaign } from './campaigns'
import type { Clock, Timeline } from './timeline'
import type { People } from './users'

// The campaigns' history, generated day by day and posted through the real pipeline (spec §6.13, §6.14.5): the
// ADV "Seed generator" sets how much of each budget is planned by now (its progress); the simulator's generator
// spreads that over the elapsed days, and the simulator's CampaignDay posts each day — Phoenix events through
// ingestion (batches `seed:<campaign>:<YYYY-MM-DD>:<n>`), sharers through POST /share's shareOffer with a phone
// of the market, friends through the landing page's open, details and claim (which make the payouts). The daily
// job then runs for each day, so delivery charges, starts, ends, credit, payouts, month closes and pace warnings
// are its own. Nothing here writes a metric, a ledger line or a payout.

const DAY_MS = 86_400_000
const MINUTE_MS = 60_000
const PREFIX = 'seed'
// The daily job runs at 02:00 UTC for the day before (README: `0 2 * * * npm run job:daily`).
const CRON_HOUR = 2
// Supa10's fraud cases (GLB §2.5), so Global's held queue has something in it: days from today.
const FRAUD_DAYS = [-3, -2]
const SEED_CLIENT = 'seed'

// The default share of the prototype's volumes (SEED_SCALE): impressions — and with them opens, shares,
// friends, payouts and spend — are scaled down so the seed stays quick. SEED_SCALE=1 gives the full volumes.
export const DEFAULT_SCALE = 0.2

export function seedScale(raw = process.env.SEED_SCALE): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_SCALE
  const n = Number(raw)
  if (!(n > 0 && n <= 1)) throw new Error(`SEED_SCALE must be a number above 0 and at most 1, not "${raw}".`)
  return n
}

type Flight = {
  spec: SeedCampaign
  // The market days it delivered on, oldest first: from its start to the day before today (or its last day).
  days: string[]
  targetCents: number
  plannedCents: number
}

// The part of the market day the campaign was on Phoenix before now.
function windowOf(c: Campaign, date: string, clock: Clock): Window | null {
  const { start, end } = dayBounds(c.country, clock.noon(date))
  const from = Math.max(start.getTime(), c.startsAt.getTime())
  const to = Math.min(end.getTime(), c.endsAt.getTime(), clock.now.getTime())
  return to > from ? { from, to } : null
}

// What is left to plan, never more than the budget still unspent.
async function leftCents(c: Campaign, f: Flight): Promise<number> {
  return Math.min(f.targetCents - f.plannedCents, c.budgetUsd * 100 - (await campaignSpendCents(c.id)))
}

async function live(made: Made, f: Flight): Promise<Campaign | null> {
  const c = await db.campaign.findUniqueOrThrow({ where: { id: made[f.spec.key]!.id } })
  return c.status === 'live' ? c : null
}

// One elapsed day: the rest of the plan spread over the days left, at the generator's U(0.8, 1.3).
async function deliverDay(f: Flight, date: string, made: Made, channelId: string, clock: Clock, rng: Rng): Promise<Campaign | null> {
  const c = await live(made, f)
  if (!c) return null
  const window = windowOf(c, date, clock)
  const left = await leftCents(c, f)
  if (!window || left <= 0) return null
  const plan = generateDay({ budgetUsd: left / 100, cpmCents: c.cpmCents, placement: c.placement }, { spendCents: 0, daysLeft: f.days.length - f.days.indexOf(date) }, rng)
  if (!plan) return null
  f.plannedCents += plan.dayCents
  await new CampaignDay(c, channelId, date, window, plan, rng, PREFIX).run()
  return c
}

// Today so far, for campaigns still live: an ordinary day's plan pro rata to the hours gone. The nightly job
// charges it tomorrow, as it would any real day.
async function deliverToday(f: Flight, made: Made, channelId: string, clock: Clock, rng: Rng): Promise<void> {
  const c = await live(made, f)
  if (!c) return
  const date = clock.date(0)
  const window = windowOf(c, date, clock)
  if (!window) return
  const share = (window.to - window.from) / DAY_MS
  const left = Math.min(Math.round((f.targetCents / Math.max(1, f.days.length)) * share), c.budgetUsd * 100 - (await campaignSpendCents(c.id)))
  if (left <= 0) return
  const plan = generateDay({ budgetUsd: left / 100, cpmCents: c.cpmCents, placement: c.placement }, { spendCents: 0, daysLeft: 1 }, rng)
  if (plan) await new CampaignDay(c, channelId, date, window, plan, rng, PREFIX).run()
}

// A Kenyan mobile number the generator never makes (its numbers start 7, 8 or 9 then eight random digits).
const fixedPhone = (n: number) => `+${MARKETS.KE.dial}711${String(n).padStart(6, '0')}`

// GLB §2.5 on Supa10, through the landing page: one friend's number brings rewards to three sharers (the third
// is held for review, phone_reuse), and a friend claims on their own link from their own browser (blocked,
// same_device). Three Phoenix sharers with numbers of their own share first.
async function fraudCases(c: Campaign, channelId: string, date: string, window: Window, k: number): Promise<void> {
  const at = (minutes: number) => new Date(Math.min(window.to - 1, window.from + minutes * MINUTE_MS))
  const links: string[] = []
  for (let i = 0; i < 3; i++) {
    const res = await shareOffer(c.id, channelId, `${PREFIX}-${c.id}-fraud-${date}-${i}`, 'whatsapp', at(60 + i), fixedPhone(k * 10 + i))
    if (typeof res === 'string') throw new Error(`share refused: ${res}`)
    links.push((await db.shareLink.findUniqueOrThrow({ where: { code: res.code }, select: { id: true } })).id)
  }
  const reuse = { id: `${PREFIX}v-${c.id}-${date}-reuse`, ipHash: SEED_CLIENT, userAgent: SEED_CLIENT }
  await recordOpen(links[0], reuse.id, reuse.ipHash, reuse.userAgent, at(90))
  await leaveDetails(links[0], c.country, fixedPhone(k * 10 + 5), '', reuse, at(91))
  for (const [i, linkId] of links.entries()) {
    if (i > 0) await recordOpen(linkId, reuse.id, reuse.ipHash, reuse.userAgent, at(92 + 2 * i))
    await recordClaim(linkId, reuse.id, reuse.ipHash, reuse.userAgent, at(93 + 2 * i))
  }
  const self = { id: `${PREFIX}v-${c.id}-${date}-self`, ipHash: SEED_CLIENT, userAgent: SEED_CLIENT }
  await recordOpen(links[1], self.id, self.ipHash, self.userAgent, at(100))
  const own = await leaveDetails(links[1], c.country, fixedPhone(k * 10 + 6), '', self, at(101))
  await recordOpen(own.id, self.id, self.ipHash, self.userAgent, at(102))
  await recordClaim(own.id, self.id, self.ipHash, self.userAgent, at(103))
}

export type History = { days: number; jobErrors: string[] }

// Day steps from the first flight day to yesterday, each at midnight UTC after the day (when it is over in
// every market): every campaign live then delivers it, in the inventory's order. Then the daily job for that
// day at 02:00 UTC. Kwik is paused once its last day is in; the live campaigns run on into today.
export function planHistory(
  timeline: Timeline, made: Made, people: People, channelId: string, clock: Clock, rng: Rng, scale: number,
): History {
  const history: History = { days: 0, jobErrors: [] }
  const flights = CAMPAIGNS.filter((s) => s.status !== 'review').map((spec): Flight => {
    const last = Math.min(spec.end ?? spec.start + spec.days!, 0) - 1
    const days = Array.from({ length: last - spec.start + 1 }, (_, i) => clock.date(spec.start + i))
    const budgetCents = spec.offer.budgetUsd * 100
    return { spec, days, targetCents: Math.round(budgetCents * spec.progress * scale), plannedCents: 0 }
  })
  const first = Math.min(...flights.map((f) => f.spec.start))
  for (let offset = first; offset <= -1; offset++) {
    const date = clock.date(offset)
    const over = clock.utc(offset + 1)
    timeline.add(over, `deliver ${date}`, async () => {
      for (const f of flights) {
        if (!f.days.includes(date)) continue
        const c = await deliverDay(f, date, made, channelId, clock, rng)
        const window = c && windowOf(c, date, clock)
        if (c && window && f.spec.key === 'supa10' && FRAUD_DAYS.includes(offset)) await fraudCases(c, channelId, date, window, offset + 100)
      }
    }, 1)
    if (offset === -1) {
      timeline.add(over, 'pause Kwik ₦1m draw', async () => {
        const kwik = CAMPAIGNS.find((s) => s.key === 'kwik')!
        await pauseCampaign(made.kwik!.id, people[kwik.by].id)
      }, 2)
    }
    const cron = new Date(Math.min(clock.utc(offset + 1, CRON_HOUR).getTime(), clock.now.getTime()))
    timeline.add(cron, `daily job ${date}`, async () => {
      const result = await runDaily(clock.noon(date), cron, { replay: true })
      if (!result.skipped) history.jobErrors.push(...result.errors.map((e) => `${date} ${e.duty}: ${e.message}`))
      history.days++
    }, 3)
  }
  timeline.add(clock.now, 'deliver today so far', async () => {
    for (const f of flights) await deliverToday(f, made, channelId, clock, rng)
  }, 4)
  return history
}
