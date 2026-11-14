import type { Placement } from '@prisma/client'
import { audit } from '@/lib/audit'
import { db } from '@/lib/db'
import { COUNTRIES, type Country } from '@/lib/markets'

// Lives in estimate.ts so the browser can reach it without this file's database import.
export { EXPECTED_OPEN_RATE } from '@/lib/estimate'

export const PLACEMENTS = ['card', 'featured', 'video', 'splash'] as const satisfies readonly Placement[]

const DEFAULT_SHARE = 0.55

// "Current" is the row with the latest effectiveFrom at or before `at`. Edits insert a row, so a
// campaign that snapshotted its CPM is never changed by a later edit.
export async function currentCpmCents(channelId: string, country: Country, placement: Placement, at = new Date()): Promise<number> {
  const row = await db.rateCard.findFirst({
    where: { channelId, country, placement, effectiveFrom: { lte: at } },
    orderBy: { effectiveFrom: 'desc' },
  })
  if (!row) throw 'NO_RATE'
  return row.cpmCents
}

// Each setter takes effect at `effectiveFrom` (now, from the Rates page; the seed back-dates its rate card).
export async function setRate(
  channelId: string, country: Country, placement: Placement, cpmCents: number, byUserId: string, effectiveFrom = new Date(),
) {
  const before = await db.rateCard
    .findFirst({ where: { channelId, country, placement, effectiveFrom: { lte: effectiveFrom } }, orderBy: { effectiveFrom: 'desc' } })
    .then((r) => r?.cpmCents ?? null)
  const row = await db.rateCard.create({ data: { channelId, country, placement, cpmCents, effectiveFrom } })
  await audit(byUserId, 'rate.set', { type: 'RateCard', id: row.id }, { country, placement, cpmCents: before }, { country, placement, cpmCents })
  return row
}

export type RateRow = { country: Country; cpmCents: Record<Placement, number | null> }

export async function rateTable(channelId: string, at = new Date()): Promise<RateRow[]> {
  const rows = await db.rateCard.findMany({
    where: { channelId, effectiveFrom: { lte: at } },
    orderBy: { effectiveFrom: 'asc' },
  })
  const latest = new Map<string, number>()
  for (const r of rows) latest.set(`${r.country}:${r.placement}`, r.cpmCents)
  return COUNTRIES.map((country) => ({
    country,
    cpmCents: Object.fromEntries(PLACEMENTS.map((p) => [p, latest.get(`${country}:${p}`) ?? null])) as RateRow['cpmCents'],
  }))
}

export async function currentFx(country: Country, at = new Date()): Promise<number> {
  const row = await db.marketFx.findFirst({ where: { country, effectiveFrom: { lte: at } }, orderBy: { effectiveFrom: 'desc' } })
  if (!row) throw 'NO_FX'
  return Number(row.fxPerUsd)
}

export async function setFx(country: Country, fxPerUsd: number, byUserId: string, effectiveFrom = new Date()) {
  const before = await currentFx(country, effectiveFrom).catch(() => null)
  const row = await db.marketFx.create({ data: { country, fxPerUsd, effectiveFrom } })
  await audit(byUserId, 'fx.set', { type: 'MarketFx', id: row.id }, { country, fxPerUsd: before }, { country, fxPerUsd })
  return row
}

export async function currentShare(channelId: string, at = new Date()): Promise<number> {
  const row = await db.channelShare.findFirst({ where: { channelId, effectiveFrom: { lte: at } }, orderBy: { effectiveFrom: 'desc' } })
  return row ? Number(row.share) : DEFAULT_SHARE
}

export async function setShare(channelId: string, share: number, byUserId: string, effectiveFrom = new Date()) {
  if (!Number.isFinite(share) || share < 0 || share > 1) throw 'INVALID'
  const before = await currentShare(channelId, effectiveFrom)
  const row = await db.channelShare.create({ data: { channelId, share, effectiveFrom } })
  await audit(byUserId, 'share.set', { type: 'ChannelShare', id: row.id }, { share: before }, { share })
  return row
}

export type MarketRates = {
  cpmCents: Record<Country, Record<Placement, number | null>>
  fxPerUsd: Record<Country, number | null>
}

// What the campaign form prices with (ADV §3): Phoenix's current CPM per market and placement, and each
// market's FX, null wherever Global has set none (all CPMs while there is no Phoenix channel).
export async function phoenixRates(at = new Date()): Promise<MarketRates> {
  const phoenix = await db.channel.findUnique({ where: { key: 'phoenix' }, select: { id: true } })
  const rows = phoenix ? await rateTable(phoenix.id, at) : []
  const none = Object.fromEntries(PLACEMENTS.map((p) => [p, null])) as Record<Placement, null>
  const fx = await Promise.all(COUNTRIES.map((c) => currentFx(c, at).catch(() => null)))
  return {
    cpmCents: Object.fromEntries(COUNTRIES.map((c) => [c, rows.find((r) => r.country === c)?.cpmCents ?? none])) as MarketRates['cpmCents'],
    fxPerUsd: Object.fromEntries(COUNTRIES.map((c, i) => [c, fx[i]])) as MarketRates['fxPerUsd'],
  }
}
