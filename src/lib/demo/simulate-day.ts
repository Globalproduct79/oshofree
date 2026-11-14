import type { Campaign, Country, ShareVia } from '@prisma/client'
import { ymd } from '@/lib/campaign-schema'
import { deliveringWhere } from '@/lib/campaign-status'
import { campaignFacts } from '@/lib/campaigns'
import { db, isUniqueViolation } from '@/lib/db'
import { generateDay, SHARE_SPLIT, type DayPlan } from '@/lib/demo/generator'
import { uniform, type Rng } from '@/lib/demo/prng'
import { ingestEvents, MAX_EVENTS, type EventInput } from '@/lib/events'
import { runDaily, type DailyResult } from '@/lib/jobs/daily'
import { leaveDetails, recordClaim, recordOpen } from '@/lib/link-events'
import { dayBounds } from '@/lib/market-clock'
import { MARKETS } from '@/lib/markets'
import { shareOffer } from '@/lib/offers'

// "Simulate a day" (spec §6.7, ADV §15): one day of synthetic Phoenix traffic for every delivering campaign,
// pushed through the real pipeline — ingestion for impressions, opens, claims and shares, POST /share's
// shareOffer for the sharers' links, the landing page's recordOpen / leaveDetails / recordClaim for their
// friends (recordClaim makes the payouts, through the fraud rules) — then the daily job. Nothing writes a
// number directly, so the reports read the simulated day exactly as they read a real one.
//
// The simulated day is the market day before today's UTC date — the day the nightly job charges, so it is
// over in every market and the job charges it whole under the same JobRun key. Noon UTC names that day in
// every market (UTC+0 to UTC+3), so each click simulates a different day. The calendar does not move.

export const SIM_JOB = 'sim'
const DAY_MS = 86_400_000
const SECOND = 1000
const MINUTE = 60 * SECOND
// Of the friends who claim, about this many leave their own number first (and get a link of their own).
const DETAILS_RATE = 0.4
// The landing page's IP hash and user agent for a simulated visitor.
const SIM_CLIENT = 'sim'

export type SimulateSummary = {
  // The JobRun that marks today as simulated.
  runId: string
  campaigns: number
  impressions: number
  opens: number
  claims: number
  shares: number
  friendOpens: number
  friendClaims: number
  payouts: number
  job: DailyResult
}

export type DayCounts = Omit<SimulateSummary, 'runId' | 'campaigns' | 'job'>
const ZERO: DayCounts = { impressions: 0, opens: 0, claims: 0, shares: 0, friendOpens: 0, friendClaims: 0, payouts: 0 }

const utcDate = (at: Date) => new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()))

// Noon UTC on the day before `now`'s UTC date.
const simulatedDay = (now: Date) => new Date(utcDate(now).getTime() - DAY_MS / 2)

// The first click of the UTC day gets its JobRun id; a second click is refused.
async function claimToday(now: Date): Promise<string> {
  try {
    return (await db.jobRun.create({ data: { name: SIM_JOB, day: utcDate(now) } })).id
  } catch (e) {
    if (isUniqueViolation(e)) throw 'ALREADY_SIMULATED'
    throw e
  }
}

export async function simulateDay(now: Date, rng: Rng): Promise<SimulateSummary> {
  const phoenix = await db.channel.findFirst({ where: { key: 'phoenix', isLive: true }, select: { id: true } })
  if (!phoenix) throw 'NO_PHOENIX'
  const runId = await claimToday(now)
  try {
    const day = simulatedDay(now)
    const campaigns = await db.campaign.findMany({ where: deliveringWhere(now), orderBy: { id: 'asc' } })
    const totals = { ...ZERO }
    let simulated = 0
    for (const c of campaigns) {
      const counts = await simulateCampaign(c, phoenix.id, day, now, rng)
      if (!counts) continue
      simulated++
      for (const k of Object.keys(totals) as (keyof DayCounts)[]) totals[k] += counts[k]
    }
    // A replay past the once-a-day guard: a "Run daily job" click may have taken the day already. Every duty
    // is idempotent and the delivery line dedupes per campaign and day, so nothing is charged twice.
    const job = await runDaily(day, now, { replay: true })
    return { runId, campaigns: simulated, ...totals, job }
  } catch (e) {
    // The day goes back to be simulated again. Retried with the same seed, the batches, sharers' links, opens
    // and claims replay as the same rows rather than adding new ones.
    await db.jobRun.delete({ where: { id: runId } }).catch(() => undefined)
    throw e
  }
}

// What the campaign delivered in its market's simulated day, from its start (it was not on Phoenix before).
async function simulateCampaign(c: Campaign, channelId: string, day: Date, now: Date, rng: Rng): Promise<DayCounts | null> {
  const { start, end } = dayBounds(c.country, day)
  const from = Math.max(start.getTime(), c.startsAt.getTime())
  const to = Math.min(end.getTime(), c.endsAt.getTime(), now.getTime())
  if (to <= from) return null
  const facts = await campaignFacts(c.id, now)
  const plan = generateDay(c, facts, rng)
  if (!plan) return null
  return new CampaignDay(c, channelId, ymd(day, c.country), { from, to }, plan, rng).run()
}

// The part of the market day the campaign was on Phoenix, as epoch milliseconds.
export type Window = { from: number; to: number }
type Shared = { linkId: string; at: number }

// One campaign's market day posted through the pipeline. The seed replays history through it too, under its own
// key prefix: batches `<prefix>:<campaign>:<date>:<n>`, sessions `<prefix>-<campaign>-<i>`, friends
// `<prefix>v-<campaign>-<date>-<j>`.
export class CampaignDay {
  private batch = 0
  private readonly phones = new Set<string>()

  constructor(
    private readonly c: Campaign,
    private readonly channelId: string,
    private readonly date: string,
    private readonly window: Window,
    private readonly plan: DayPlan,
    private readonly rng: Rng,
    private readonly prefix: string = SIM_JOB,
  ) {}

  async run(): Promise<DayCounts> {
    const { plan, window } = this
    // Phoenix sessions: impressions spread over the day, opens a subset of them, claims and shares subsets of
    // the opens, each a little after the one before.
    const step = (window.to - window.from) / Math.max(1, plan.impressions)
    const shown = Array.from({ length: plan.impressions }, (_, i) => this.clip(window.from + (i + this.rng()) * step))
    const opened = this.pick(plan.impressions, plan.opens).map((i) => ({ i, at: this.after(shown[i], 5 * SECOND, 2 * MINUTE) }))
    const claimed = this.pick(opened.length, plan.claims).map((j) => ({ i: opened[j].i, at: this.after(opened[j].at, 5 * SECOND, 5 * MINUTE) }))
    const sharing = this.pick(opened.length, plan.shares).map((j) => ({ i: opened[j].i, at: this.after(opened[j].at, 10 * SECOND, 10 * MINUTE) }))

    const impressions = await this.post(shown.map((at, i) => this.event('impression', i, at)))
    const opens = await this.post(opened.map((o) => this.event('open', o.i, o.at)))
    const claims = await this.post(claimed.map((o) => this.event('claim', o.i, o.at)))
    const { links, events } = await this.share(sharing)
    await this.post(events)
    const friends = await this.friends(links)
    const payouts = links.length
      ? await db.rewardPayout.count({
          where: { shareLinkId: { in: links.map((l) => l.linkId) }, createdAt: { gte: new Date(window.from), lt: new Date(window.to) } },
        })
      : 0
    return { impressions, opens, claims, shares: links.length, ...friends, payouts }
  }

  // Each sharer verifies a number of the market and asks POST /share for their link; Phoenix then posts the share.
  private async share(sharing: { i: number; at: number }[]): Promise<{ links: Shared[]; events: EventInput[] }> {
    const vias = this.shuffle(SHARE_SPLIT.flatMap(([via]) => Array<ShareVia>(this.plan.via[via]).fill(via)))
    const links: Shared[] = []
    const events: EventInput[] = []
    for (const [k, s] of sharing.entries()) {
      const via = vias[k]
      const res = await shareOffer(this.c.id, this.channelId, this.session(s.i), via, new Date(s.at), this.phone(this.c.country))
      if (typeof res === 'string') continue
      const link = await db.shareLink.findUniqueOrThrow({ where: { code: res.code }, select: { id: true } })
      links.push({ linkId: link.id, at: s.at })
      events.push({ ...this.event('share', s.i, s.at), token: res.code, via })
    }
    return { links, events }
  }

  // Friends open the shared links on the landing page; the first friendClaims of them claim, about 40 % of
  // those after leaving a number of their own.
  private async friends(links: Shared[]): Promise<{ friendOpens: number; friendClaims: number }> {
    let friendOpens = 0
    let friendClaims = 0
    if (!links.length) return { friendOpens, friendClaims }
    for (let j = 0; j < this.plan.friendOpens; j++) {
      const link = links[Math.floor(this.rng() * links.length)]
      const visitor = { id: `${this.prefix}v-${this.c.id}-${this.date}-${j}`, ipHash: SIM_CLIENT, userAgent: SIM_CLIENT }
      const openedAt = this.after(link.at, MINUTE, 4 * 60 * MINUTE)
      const { deduped } = await recordOpen(link.linkId, visitor.id, visitor.ipHash, visitor.userAgent, new Date(openedAt))
      if (!deduped) friendOpens++
      if (j >= this.plan.friendClaims) continue
      const claimedAt = this.after(openedAt, 30 * SECOND, 10 * MINUTE)
      if (this.rng() < DETAILS_RATE) {
        const at = new Date(openedAt + Math.floor((claimedAt - openedAt) / 2))
        await leaveDetails(link.linkId, this.c.country, this.phone(this.c.country), '', visitor, at)
      }
      const { first } = await recordClaim(link.linkId, visitor.id, visitor.ipHash, visitor.userAgent, new Date(claimedAt))
      if (first) friendClaims++
    }
    return { friendOpens, friendClaims }
  }

  // Posts the events in batches of at most 500 under this campaign's day's keys; how many were accepted.
  private async post(events: EventInput[]): Promise<number> {
    let accepted = 0
    for (let i = 0; i < events.length; i += MAX_EVENTS) {
      const key = `${this.prefix}:${this.c.id}:${this.date}:${this.batch++}`
      accepted += (await ingestEvents(this.channelId, key, events.slice(i, i + MAX_EVENTS))).accepted
    }
    return accepted
  }

  private session(i: number): string {
    return `${this.prefix}-${this.c.id}-${i}`
  }

  private event(type: 'impression' | 'open' | 'claim' | 'share', i: number, at: number): EventInput {
    const { c } = this
    return { type, offer_id: c.id, placement: c.placement, country: c.country, session_id: this.session(i), ts: new Date(at).toISOString() }
  }

  // k of n indices in order, each set of k equally likely (selection sampling).
  private pick(n: number, k: number): number[] {
    const out: number[] = []
    for (let i = 0; i < n && out.length < k; i++) if (this.rng() * (n - i) < k - out.length) out.push(i)
    return out
  }

  private shuffle<T>(xs: T[]): T[] {
    for (let i = xs.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1))
      ;[xs[i], xs[j]] = [xs[j], xs[i]]
    }
    return xs
  }

  // An instant inside the day.
  private clip(t: number): number {
    return Math.min(this.window.to - 1, Math.max(this.window.from, Math.floor(t)))
  }

  private after(t: number, lo: number, hi: number): number {
    return this.clip(t + uniform(this.rng, lo, hi))
  }

  // A mobile number of the market, +<dial> and 9 digits, never one this campaign's day already used.
  private phone(country: Country): string {
    for (;;) {
      let digits = String(7 + Math.floor(this.rng() * 3))
      for (let d = 0; d < 8; d++) digits += Math.floor(this.rng() * 10)
      const phone = `+${MARKETS[country].dial}${digits}`
      if (this.phones.has(phone)) continue
      this.phones.add(phone)
      return phone
    }
  }
}
