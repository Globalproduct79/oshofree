import type { Campaign, Workspace } from '@prisma/client'
import { campaignDates, flightDays, isRealDay, REVISION_TERMS, ymd } from '@/lib/campaign-schema'
import type { PlacementKey } from '@/lib/copy-components'
import { CATEGORIES, type Category, type Country } from '@/lib/markets'
import { tokens } from '@/lib/tokens'

// The New campaign form's state (ADV §3), exactly as the inputs hold it: text stays text until
// toInput turns it into what campaignInput parses. Plain JSON, so the draft store can keep it.

export type Creative = { key: string; kind: 'image' | 'video'; url: string }
export const PLACEMENT_ORDER: readonly PlacementKey[] = ['card', 'featured', 'video', 'splash']
export type RunsFor = '7' | '14' | '30' | 'custom'
export const RUNS_FOR: readonly RunsFor[] = ['7', '14', '30', 'custom']

export type FormValues = {
  name: string
  brand: string
  country: Country
  category: Category
  tileColor: string
  headline: string
  description: string
  placement: PlacementKey
  creative: Creative | null
  redeemMethod: 'code' | 'link'
  linkUrl: string
  budgetUsd: string
  runsFor: RunsFor
  startsAt: string
  // Only read when runsFor is 'custom'.
  endsAt: string
  rewardLocal: string
  termsAccepted: boolean
}

const DAY = 86_400_000

// Which creatives a placement takes: an image for a card or tile, an MP4 for video, either for splash.
export const ACCEPT: Record<PlacementKey, string> = {
  card: 'image/*',
  featured: 'image/*',
  video: 'video/mp4',
  splash: 'image/*,video/mp4',
}

export const fits = (placement: PlacementKey, creative: Creative | null): boolean =>
  creative === null ||
  (creative.kind === 'image' ? placement !== 'video' : placement === 'video' || placement === 'splash')

// ADV §3 defaults: the workspace's name (a Brand) or nothing (an Agency), its country, Food & drink,
// orange, Wall card, a link offer, $300 for 14 days from tomorrow, reward 50, terms unticked.
export function newCampaignDefaults(ws: Pick<Workspace, 'name' | 'type' | 'country'>, now = new Date()): FormValues {
  return {
    name: '',
    brand: ws.type === 'Agency' ? '' : ws.name,
    country: ws.country,
    category: 'Food & drink',
    tileColor: tokens.tileColors[0],
    headline: '',
    description: '',
    placement: 'card',
    creative: null,
    redeemMethod: 'link',
    linkUrl: '',
    budgetUsd: '300',
    runsFor: '14',
    startsAt: ymd(new Date(now.getTime() + DAY), ws.country),
    endsAt: '',
    rewardLocal: '50',
    termsAccepted: false,
  }
}

// A flight of exactly 7, 14 or 30 days is a preset; any other is custom and ends on a date.
export function flightOf(c: Pick<Campaign, 'startsAt' | 'endsAt' | 'country'>): Pick<FormValues, 'runsFor' | 'endsAt'> {
  const days = Math.round((c.endsAt.getTime() - c.startsAt.getTime()) / DAY)
  const endsAt = ymd(c.endsAt, c.country)
  return days === 7 || days === 14 || days === 30 ? { runsFor: String(days) as RunsFor, endsAt } : { runsFor: 'custom', endsAt }
}

// Edit offer: every field of the campaign, terms unticked again (ADV §3). The creative's URL comes from
// the server (storage decides where creatives live).
export function campaignDefaults(c: Campaign, creativeUrl: (key: string) => string): FormValues {
  const key = c.creativeVideoKey ?? c.creativeImageKey
  return {
    name: c.name,
    brand: c.brand,
    country: c.country,
    category: (CATEGORIES as readonly string[]).includes(c.category) ? (c.category as Category) : 'Food & drink',
    tileColor: c.tileColor ?? tokens.tileColors[0],
    headline: c.headline,
    description: c.description,
    placement: c.placement,
    creative: key ? { key, kind: c.creativeVideoKey ? 'video' : 'image', url: creativeUrl(key) } : null,
    redeemMethod: c.redeemMethod,
    linkUrl: c.linkUrl ?? '',
    budgetUsd: String(c.budgetUsd),
    startsAt: ymd(c.startsAt, c.country),
    ...flightOf(c),
    rewardLocal: String(c.rewardLocal),
    termsAccepted: false,
  }
}

// The prototype's `+value || 0` for the cost box and preview; toInput keeps NaN for the rules to refuse.
export const amount = (s: string) => Number(s) || 0
const parsedNumber = (s: string) => (s.trim() === '' ? Number.NaN : Number(s))

// 'YYYY-MM-DD' n days on, or '' when the day is not on the calendar.
export function plusDays(day: string, n: number): string {
  return isRealDay(day) ? new Date(Date.parse(`${day}T00:00:00.000Z`) + n * DAY).toISOString().slice(0, 10) : ''
}

// The flight's length in days, or null while a custom end date is not a usable one.
export function flightLength(v: Pick<FormValues, 'runsFor' | 'startsAt' | 'endsAt'>): number | null {
  if (v.runsFor !== 'custom') return Number(v.runsFor)
  const days = flightDays(v.startsAt, v.endsAt)
  return Number.isInteger(days) && days >= 1 ? days : null
}

// The offer fields, as a running campaign's revision takes them (spec §6.14.3).
export function offerInput(v: FormValues) {
  return {
    brand: v.brand,
    category: v.category,
    headline: v.headline,
    description: v.description,
    tileColor: v.tileColor,
    creativeImageKey: v.creative?.kind === 'image' ? v.creative.key : undefined,
    creativeVideoKey: v.creative?.kind === 'video' ? v.creative.key : undefined,
    placement: v.placement,
    redeemMethod: v.redeemMethod,
    // A code offer has no link, whatever the disabled field still shows.
    linkUrl: v.redeemMethod === 'link' ? v.linkUrl : undefined,
    termsAccepted: v.termsAccepted,
  }
}

// What the rules judge for a running campaign's revision: its offer, with stand-in money and timing.
export function revisionInput(v: FormValues) {
  return { ...offerInput(v), name: v.name, country: v.country, ...REVISION_TERMS }
}

// What campaignInput parses: the whole campaign.
export function toInput(v: FormValues) {
  return {
    ...offerInput(v),
    name: v.name,
    country: v.country,
    budgetUsd: parsedNumber(v.budgetUsd),
    rewardLocal: parsedNumber(v.rewardLocal),
    startsAt: v.startsAt,
    ...(v.runsFor === 'custom' ? { endsAt: v.endsAt } : { runsForDays: Number(v.runsFor) }),
  }
}

// The exclusive end the Phoenix preview prints as the last day; until the dates are usable, a day from now.
export function previewEndsAt(v: FormValues, now = new Date()): Date {
  const days = flightLength(v)
  // campaignDates throws on a day that is not on the calendar.
  if (days === null || !isRealDay(v.startsAt)) return new Date(now.getTime() + DAY)
  return campaignDates(v.startsAt, days, v.country).endsAt
}
