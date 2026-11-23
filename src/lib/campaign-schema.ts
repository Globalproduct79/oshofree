import { z } from 'zod'
import { CAMPAIGN_FORM_COPY as COPY } from '@/lib/copy-campaign-form'
import { localAmount, usd } from '@/lib/format'
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

// The largest share reward, in whole local units: the credit limit's ceiling (2,147,483,647 cents) in whole
// units, the bound a budget has too. A reward this size fits its 32-bit column, and so does the payout it becomes
// in cents at any exchange rate of 1 or more to the dollar. money.ts holds the cents (it is server-only).
export const MAX_REWARD_LOCAL = 21_474_836

// The text fields' lengths, trimmed: the schema, the rules, the inputs' maxLength and the copy all read these.
export const NAME_MIN = 2
export const NAME_MAX = 80
export const BRAND_MAX = 80
export const HEADLINE_MAX = 48
export const DESCRIPTION_MAX = 240

const base = z.object({
  name: z.string().trim().min(NAME_MIN).max(NAME_MAX),
  brand: z.string().trim().min(1).max(BRAND_MAX),
  country: z.enum(COUNTRIES),
  category: z.enum(CATEGORIES),
  headline: z.string().trim().max(HEADLINE_MAX),
  description: z.string().trim().max(DESCRIPTION_MAX),
  tileColor: z.string().refine((c) => (tokens.tileColors as readonly string[]).includes(c)),
  creativeImageKey: z.string().regex(IMAGE_KEY_RE).optional(),
  creativeVideoKey: z.string().regex(VIDEO_KEY_RE).optional(),
  placement: z.enum(['card', 'featured', 'video', 'splash']),
  redeemMethod: z.enum(['code', 'link']),
  claimCode: z.string().trim().min(1).max(24).optional(),
  linkUrl: z.string().trim().transform(normaliseUrl).optional(),
  budgetUsd: z.number().int().min(50),
  rewardLocal: z.number().int().min(0).max(MAX_REWARD_LOCAL),
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
// The prototype's /draw|jackpot/i and /jackpot|bet/i, read as words: "bet", "bets", "betting", "Bet9ja", "draw",
// "draws", "drawing" count; "better", "between", "alphabet", "withdraw" and "drawer" do not (a fintech's "Free
// withdrawals" is not a draw, a data bundle's "Better rates" is not a bet).
const DRAW = /jackpot|\bdraw(s|ing)?(?![a-z])/i
const BET = /jackpot|\bbet(s|ting)?(?![a-z])/i

// The 18+ badge and flag. Not the licence rule, which also matches "draw".
export function ageGated(i: { category: string; headline: string }): boolean {
  return i.category === 'Betting' || BET.test(i.headline)
}

// What a placement can show: an image on a card or tile, an MP4 on video, one of either on splash.
function creativeMismatch(i: CampaignInput) {
  if (i.creativeImageKey && i.creativeVideoKey) return true
  if (i.creativeVideoKey && (i.placement === 'card' || i.placement === 'featured')) return true
  return Boolean(i.creativeImageKey) && i.placement === 'video'
}

// Betting or a draw (GLB §2.1): such an offer must carry a licence or approval number.
export const isBettingOrDraw = (i: { category: string; headline: string }): boolean =>
  i.category === 'Betting' || DRAW.test(i.headline)

export const hasLicence = (description: string): boolean => LICENCE.test(description)

function needsLicence(i: CampaignInput) {
  return isBettingOrDraw(i) && !hasLicence(i.description)
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

// The form field a refusal is about (the form's own names: FormValues has the same keys), so the form can mark
// it, move the cursor to it and say why beside it. null: nothing on the form fixes it (a missing rate).
export const CAMPAIGN_FIELDS = [
  'name', 'brand', 'country', 'category', 'tileColor', 'headline', 'description', 'placement', 'creative', 'redeemMethod',
  'linkUrl', 'budgetUsd', 'runsFor', 'startsAt', 'endsAt', 'rewardLocal', 'termsAccepted',
] as const
export type CampaignField = (typeof CAMPAIGN_FIELDS)[number]
const isField = (key: string): key is CampaignField => (CAMPAIGN_FIELDS as readonly string[]).includes(key)
export type Refusal = { field: CampaignField | null; message: string }

// An address Phoenix users can open: https, and a host with a dot in it ("https://" alone, or a name with a space
// in it, is not one).
export function isHttpsLink(raw: string | undefined): boolean {
  if (!raw?.trim()) return false
  try {
    const u = new URL(raw.trim())
    return u.protocol === 'https:' && u.hostname.includes('.') && !u.hostname.startsWith('.') && !u.hostname.endsWith('.')
  } catch {
    return false
  }
}

const isWhole = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n)
const within = (s: string, min: number, max: number) => s.trim().length >= min && s.trim().length <= max

// The first failing rule, in the prototype's ADV §3 order, and the field it is about. Each field's own shape (a name's
// length, a whole-dollar budget, a real date) is judged beside that field's rule, not after every other rule. The order
// is the prototype's, not the page's: the link is judged before the creative above it, and the reward before the dates
// above it, so pressing the primary can move the cursor down the page and then back up.
export function firstRefusal(i: CampaignInput, ctx: ValidationContext): Refusal | null {
  const V = COPY.validation
  const X = COPY.invalid
  const no = (field: CampaignField, message: string): Refusal => ({ field, message })
  if (!i.name.trim()) return no('name', V.name)
  if (!within(i.name, NAME_MIN, NAME_MAX)) return no('name', X.name(NAME_MIN, NAME_MAX))
  if (!i.brand.trim()) return no('brand', V.brand)
  if (!within(i.brand, 1, BRAND_MAX)) return no('brand', X.brand(BRAND_MAX))
  if (!i.headline.trim()) return no('headline', V.headline)
  if (!within(i.headline, 1, HEADLINE_MAX)) return no('headline', X.headline(HEADLINE_MAX))
  if (!i.description.trim()) return no('description', V.description)
  if (!within(i.description, 1, DESCRIPTION_MAX)) return no('description', X.description(DESCRIPTION_MAX))
  if (needsLicence(i)) return no('description', V.licence)
  if (i.redeemMethod === 'link') {
    if (!i.linkUrl?.trim().toLowerCase().startsWith('https://')) return no('linkUrl', V.link)
    if (!isHttpsLink(i.linkUrl)) return no('linkUrl', V.linkInvalid)
  }
  if (i.placement === 'video' && !i.creativeVideoKey) return no('creative', V.creative)
  if (i.placement === 'splash' && !i.creativeImageKey && !i.creativeVideoKey) return no('creative', V.creative)
  if (!(i.budgetUsd >= 50)) return no('budgetUsd', V.budget)
  if (!isWhole(i.budgetUsd)) return no('budgetUsd', X.budgetUsd)
  if (!isWhole(i.rewardLocal) || i.rewardLocal < 0) return no('rewardLocal', X.rewardLocal)
  if (i.rewardLocal > MAX_REWARD_LOCAL) return no('rewardLocal', V.rewardTooLarge)
  if (!isRealDay(i.startsAt)) return no('startsAt', X.startsAt)
  if (!ctx.isEdit && ctx.today && i.startsAt < ctx.today) return no('startsAt', V.startPast)
  if (i.endsAt !== undefined) {
    if (!isRealDay(i.endsAt)) return no('endsAt', X.endsAt)
    const days = flightDays(i.startsAt, i.endsAt)
    if (!(days >= 1 && days <= 90)) return no('endsAt', V.flight)
  }
  // The form never pairs these (it drops a creative the placement cannot take); a crafted request might.
  if (creativeMismatch(i)) return no('creative', V.creativeMismatch)
  const addedUsd = ctx.isEdit ? Math.max(0, i.budgetUsd - (ctx.previousBudgetUsd ?? 0)) : i.budgetUsd
  const excess = ctx.creditInUseCents + addedUsd * 100 - ctx.creditLimitCents
  if (excess > 0) return no('budgetUsd', V.credit(usd(ctx.creditLimitCents), usd(excess)))
  if (i.termsAccepted !== true) return no('termsAccepted', V.terms)
  return null
}

// The first failing rule's sentence, or null.
export function validateCampaign(i: CampaignInput, ctx: ValidationContext): string | null {
  return firstRefusal(i, ctx)?.message ?? null
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
export function localMidnight(ymd: string, country: Country): Date {
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

// The label the wall shows, derived from the reward so the two can never disagree; thousands grouped ('Earn ₦1,000
// airtime'). Stored on the campaign, so an existing one changes only when its reward is edited.
export const rewardLabel = (country: Country, rewardLocal: number) =>
  `Earn ${localAmount(rewardLocal, country)} airtime`

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

export type Checked = { ok: true; input: CampaignInput } | ({ ok: false } & Refusal)

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const optStr = (v: unknown) => (typeof v === 'string' ? v : undefined)
const num = (v: unknown) => (typeof v === 'number' ? v : Number.NaN)

// Whatever arrives, typed so the rules can read it without throwing.
function candidate(raw: unknown): CampaignInput {
  const r = (raw !== null && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    ...r,
    name: str(r.name), brand: str(r.brand), category: str(r.category), headline: str(r.headline),
    description: str(r.description), linkUrl: optStr(r.linkUrl), creativeImageKey: optStr(r.creativeImageKey),
    creativeVideoKey: optStr(r.creativeVideoKey), budgetUsd: num(r.budgetUsd), rewardLocal: num(r.rewardLocal),
    startsAt: str(r.startsAt), endsAt: optStr(r.endsAt), termsAccepted: r.termsAccepted === true,
  } as unknown as CampaignInput
}

// The schema's names for the form's fields, where they differ.
const SCHEMA_FIELD: Record<string, CampaignField> = {
  creativeImageKey: 'creative', creativeVideoKey: 'creative', runsForDays: 'runsFor', claimCode: 'redeemMethod',
}

// The form's verdict: the first ADV §3 rule that fails, in order, then any field the schema refuses that the rules
// do not name (a market or a colour the form never offers, sent past it). Never throws, and never says the schema's
// own words: every refusal is a sentence from the copy file.
export function checkCampaign(raw: unknown, ctx: ValidationContext): Checked {
  const parsed = campaignInput.safeParse(raw)
  if (parsed.success) {
    const rule = firstRefusal(parsed.data, ctx)
    return rule ? { ok: false, ...rule } : { ok: true, input: parsed.data }
  }
  const rule = firstRefusal(candidate(raw), ctx)
  if (rule) return { ok: false, ...rule }
  const key = String(parsed.error.issues[0]?.path[0] ?? '')
  const field = SCHEMA_FIELD[key] ?? (isField(key) ? key : null)
  return { ok: false, field, message: COPY.invalid.other }
}
