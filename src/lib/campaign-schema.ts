import { z } from 'zod'
import { CAMPAIGN_FORM_COPY as COPY } from '@/lib/copy-campaign-form'
import { usd } from '@/lib/format'
import { CATEGORIES, COUNTRIES, MARKETS, type Country } from '@/lib/markets'
import { IMAGE_KEY_RE, VIDEO_KEY_RE } from '@/lib/image-rules'
import { tokens } from '@/lib/tokens'

// No database here: the campaign form imports this in the browser.

// Stored as the WHATWG serialisation: path and query percent-encoded, host punycoded, so it is
// always a valid Location header. Unparseable input passes through for validateCampaign to refuse.
export function normaliseUrl(raw: string): string {
  try {
    return new URL(raw).href
  } catch {
    return raw
  }
}

const YMD = /^\d{4}-\d{2}-\d{2}$/

// A calendar day that exists: Date.parse takes 2026-02-30 as 2 March, so the day must survive a round trip.
export const isRealDay = (s: string) => {
  const t = Date.parse(`${s}T00:00:00.000Z`)
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s
}
const calendarDay = z.string().regex(YMD).refine(isRealDay)

const base = z.object({
  name: z.string().trim().min(2).max(80),
  brand: z.string().trim().min(1).max(80),
  country: z.enum(COUNTRIES),
  category: z.enum(CATEGORIES),
  headline: z.string().trim().max(48),
  description: z.string().trim().max(240),
  tileColor: z.string().refine((c) => (tokens.tileColors as readonly string[]).includes(c)),
  creativeImageKey: z.string().regex(IMAGE_KEY_RE).optional(),
  creativeVideoKey: z.string().regex(VIDEO_KEY_RE).optional(),
  placement: z.enum(['card', 'featured', 'video', 'splash']),
  redeemMethod: z.enum(['code', 'link']),
  claimCode: z.string().trim().min(1).max(24).optional(),
  linkUrl: z.string().trim().transform(normaliseUrl).optional(),
  budgetUsd: z.number().int().min(50),
  rewardLocal: z.number().int().min(0),
  startsAt: calendarDay,
  // A preset flight, or a custom one that ends on a date: exactly one of the two.
  runsForDays: z.union([z.literal(7), z.literal(14), z.literal(30)]).optional(),
  endsAt: calendarDay.optional(),
})

const oneFlight = (i: { runsForDays?: number; endsAt?: string }) => (i.runsForDays === undefined) !== (i.endsAt === undefined)
const FLIGHT = { message: 'Give either runsForDays or endsAt', path: ['runsForDays'] }

export const campaignInput = base.extend({ termsAccepted: z.literal(true) }).refine(oneFlight, FLIGHT)
// The form's values with the confirmation unticked (the draft store checks restored fields against it);
// submission needs campaignInput.
export const campaignDraftInput = base.extend({ termsAccepted: z.boolean() }).refine(oneFlight, FLIGHT)
export type CampaignInput = z.infer<typeof campaignInput>

const LICENCE = /licen|approv|NLRC|BCLB|LONASE|GBT/i
const DRAW = /draw|jackpot/i

// The 18+ badge and flag. Not the licence rule, which also matches "draw".
export function ageGated(i: { category: string; headline: string }): boolean {
  return i.category === 'Betting' || /jackpot|bet/i.test(i.headline)
}

function needsLicence(i: CampaignInput) {
  return (i.category === 'Betting' || DRAW.test(i.headline)) && !LICENCE.test(i.description)
}

const DAY = 86_400_000
const dayNumber = (ymd: string) => Date.parse(`${ymd}T00:00:00.000Z`) / DAY

// Whole days from one date to the next; NaN when either is not a date.
export const flightDays = (startsAt: string, endsAt: string) => dayNumber(endsAt) - dayNumber(startsAt)

export type ValidationContext = {
  workspaceType: 'Brand' | 'Agency'
  creditLimitCents: number
  creditInUseCents: number
  isEdit?: boolean
  previousBudgetUsd?: number
  /** The market's calendar day ('YYYY-MM-DD'); when given, a new campaign cannot start before it. */
  today?: string
}

// The first failing rule, in the order the New campaign form shows them (ADV §3), or null.
export function validateCampaign(i: CampaignInput, ctx: ValidationContext): string | null {
  const V = COPY.validation
  if (!i.name.trim()) return V.name
  if (!i.brand.trim()) return V.brand
  if (!i.headline.trim()) return V.headline
  if (!i.description.trim()) return V.description
  if (needsLicence(i)) return V.licence
  if (i.redeemMethod === 'link' && !i.linkUrl?.trim().startsWith('https://')) return V.link
  if (i.placement === 'video' && !i.creativeVideoKey) return V.creative
  if (i.placement === 'splash' && !i.creativeImageKey && !i.creativeVideoKey) return V.creative
  if (!(i.budgetUsd >= 50)) return V.budget
  if (!ctx.isEdit && ctx.today && i.startsAt < ctx.today) return V.startPast
  if (i.endsAt !== undefined) {
    const days = flightDays(i.startsAt, i.endsAt)
    if (!(days >= 1 && days <= 90)) return V.flight
  }
  const addedUsd = ctx.isEdit ? Math.max(0, i.budgetUsd - (ctx.previousBudgetUsd ?? 0)) : i.budgetUsd
  const excess = ctx.creditInUseCents + addedUsd * 100 - ctx.creditLimitCents
  if (excess > 0) return V.credit(usd(ctx.creditLimitCents), usd(excess))
  if (i.termsAccepted !== true) return V.terms
  return null
}

// Milliseconds the market's clock is ahead of UTC at `at`. The five markets have no DST.
function offsetMs(timeZone: string, at: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(at)
  const n = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) - Math.floor(at / 1000) * 1000
}

// The UTC instant of local midnight on `ymd` in the market.
function localMidnight(ymd: string, country: Country): Date {
  const guess = Date.parse(`${ymd}T00:00:00.000Z`)
  return new Date(guess - offsetMs(MARKETS[country].timezone, guess))
}

// A campaign starts at its market's local midnight on the start date and ends at local midnight
// runsForDays later, or on endsAt for a custom flight.
export function campaignDates(startsAt: string, runsForDays: number | undefined, country: Country, endsAt?: string) {
  const start = localMidnight(startsAt, country)
  if (endsAt !== undefined) return { startsAt: start, endsAt: localMidnight(endsAt, country) }
  const end = new Date(start.getTime() + (runsForDays ?? 0) * DAY)
  return { startsAt: start, endsAt: end }
}

// The market's calendar day of an instant ('YYYY-MM-DD'). Campaign dates are the market's local
// midnight, so a UTC slice can be a day out.
export function ymd(at: Date, country: Country): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MARKETS[country].timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(at)
}

export const todayIn = (country: Country, now = new Date()) => ymd(now, country)

// The label the wall shows, derived from the reward so the two can never disagree.
export const rewardLabel = (country: Country, rewardLocal: number) =>
  `Earn ${MARKETS[country].symbol}${rewardLocal} airtime`

// ---- The New campaign form and Edit offer, on both sides of the wire ----

export type CreditPosition = { limitCents: number; inUseCents: number }
// An edit: whether the campaign is running (a revision), and what its budget already holds in credit
// in use (budget for a committed campaign, spend otherwise), so only the increase counts.
export type FormEdit = { running: boolean; heldCents: number }

// The rules' context. A new campaign cannot start before today in its market; an edit counts only what
// it adds to credit in use; a running campaign's revision changes no money (spec §6.14.3), so it is
// never over the limit.
export function ruleContext(
  workspaceType: ValidationContext['workspaceType'], credit: CreditPosition, country: Country, edit?: FormEdit, now = new Date(),
): ValidationContext {
  if (edit?.running) return { workspaceType, creditLimitCents: Number.POSITIVE_INFINITY, creditInUseCents: 0, isEdit: true }
  const money = { workspaceType, creditLimitCents: credit.limitCents, creditInUseCents: credit.inUseCents }
  if (edit) return { ...money, isEdit: true, previousBudgetUsd: edit.heldCents / 100 }
  return { ...money, today: todayIn(country, now) }
}

// A revision is judged on its offer alone: its money and timing are not the form's to change (spec
// §6.14.3), so the rules see these instead of whatever "Change without review" has made of the real
// ones (a budget under $50, a flight stretched past 90 days), which would otherwise lock the offer.
export const REVISION_TERMS = { budgetUsd: 50, rewardLocal: 0, startsAt: '2000-01-01', runsForDays: 7 } as const

export type Checked = { ok: true; input: CampaignInput } | { ok: false; message: string }

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const optStr = (v: unknown) => (typeof v === 'string' ? v : undefined)

// Whatever arrives, typed so the rules can read it without throwing.
function candidate(raw: unknown): CampaignInput {
  const r = (raw !== null && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    ...r,
    name: str(r.name), brand: str(r.brand), category: str(r.category), headline: str(r.headline),
    description: str(r.description), linkUrl: optStr(r.linkUrl), creativeImageKey: optStr(r.creativeImageKey),
    creativeVideoKey: optStr(r.creativeVideoKey), budgetUsd: typeof r.budgetUsd === 'number' ? r.budgetUsd : Number.NaN,
    startsAt: str(r.startsAt), endsAt: optStr(r.endsAt), termsAccepted: r.termsAccepted === true,
  } as unknown as CampaignInput
}

// The form's verdict: the first ADV §3 rule that fails, in order, then any field the schema refuses
// that the rules do not name (a one-letter name, a date not on the calendar). Never throws.
export function checkCampaign(raw: unknown, ctx: ValidationContext): Checked {
  const parsed = campaignInput.safeParse(raw)
  if (parsed.success) {
    const rule = validateCampaign(parsed.data, ctx)
    return rule ? { ok: false, message: rule } : { ok: true, input: parsed.data }
  }
  const rule = validateCampaign(candidate(raw), ctx)
  if (rule) return { ok: false, message: rule }
  const field = String(parsed.error.issues[0]?.path[0] ?? '') as keyof typeof COPY.invalid
  return { ok: false, message: Object.hasOwn(COPY.invalid, field) ? COPY.invalid[field] : COPY.invalid.other }
}
