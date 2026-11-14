import { Prisma, type Campaign, type CampaignStatus, type ChannelEventType, type LedgerKind, type ShareVia } from '@prisma/client'
import type { CardModel } from '@/components/og/CampaignCard'
import { HOME_FILTERS, type HomeFilter } from '@/lib/campaign-filters'
import { rejectReasonText } from '@/lib/copy-campaign'
import { REPORT_COPY } from '@/lib/copy-report'
import { db } from '@/lib/db'
import { daysLeft, fd, fmt, initials, maskPhone, pct } from '@/lib/format'
import { COUNTRIES, MARKETS, type Country } from '@/lib/markets'
import { campaignSpendCents, monthBounds } from '@/lib/money'
import { currentShare } from '@/lib/rates'
import { imageUrl } from '@/lib/storage'
import { tokens } from '@/lib/tokens'

// Every number the prototype's reports print, computed from stored rows (spec §6.14.2):
//   imp, opens, claims  ChannelEvent Impression / Open / Claim
//   shares              ShareLink rows by a Channel or Consumer sharer that went out on a medium (`via`)
//   sOpens              LinkEvent Open on links of depth ≥ 1, deduped rows left out
//   sClaims             RewardPayout rows not blocked or rejected: the successful shares
//   spend, rewards      the ledger's delivery and reward charges
// Phoenix's ShareOpen / ShareClaim events are stored for the channel's own stats and never read here.

const DAY_MS = 86_400_000
const DAYS = 14
const PHOENIX = 'phoenix'
// What campaignSpendCents counts as spend.
const CHARGES: LedgerKind[] = ['delivery', 'reward']
// The four media of the split, in the prototype's order; copy and other count as shares but not here.
const SPLIT = ['whatsapp', 'facebook', 'x', 'sms'] as const satisfies readonly ShareVia[]
type Split = (typeof SPLIT)[number]

const SHARE: Prisma.ShareLinkWhereInput = { sharerType: { in: ['Channel', 'Consumer'] }, via: { not: null } }
const SUCCESSFUL: Prisma.RewardPayoutWhereInput = { status: { notIn: ['blocked', 'rejected'] } }
// List order (ADV §1): newest submission first ("newest submissions are prepended"), never-submitted last.
export const LIST_ORDER: Prisma.CampaignOrderByWithRelationInput[] = [
  { submittedAt: { sort: 'desc', nulls: 'last' } },
  { createdAt: 'desc' },
  { id: 'desc' },
]

const ratio = (a: number, b: number) => (b === 0 ? 0 : a / b)
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
// −Σ of charge rows as a positive number.
const charged = (total: number | null) => (total ? -total : 0)

// ---- One grouped read per metric, for any number of campaigns ----

async function channelEventsBy(ids: string[], types: ChannelEventType[]) {
  const rows = await db.channelEvent.groupBy({
    by: ['campaignId', 'type'],
    where: { campaignId: { in: ids }, type: { in: types } },
    _count: { _all: true },
  })
  const counts = new Map(rows.map((r) => [`${r.campaignId}:${r.type}`, r._count._all]))
  return (id: string, type: ChannelEventType) => counts.get(`${id}:${type}`) ?? 0
}

function sharesBy(ids: string[]) {
  return db.shareLink.groupBy({ by: ['campaignId', 'via'], where: { campaignId: { in: ids }, ...SHARE }, _count: { _all: true } })
}

// Prisma cannot group LinkEvent by its link's campaign, so this one join is SQL.
async function friendOpensBy(ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map()
  const rows = await db.$queryRaw<{ campaignId: string; n: number }[]>`
    SELECT l."campaignId", count(*)::int AS n
    FROM "LinkEvent" e JOIN "ShareLink" l ON l."id" = e."linkId"
    WHERE l."campaignId" IN (${Prisma.join(ids)}) AND l."depth" >= 1 AND e."type" = 'Open' AND e."deduped" = false
    GROUP BY 1`
  return new Map(rows.map((r) => [r.campaignId, r.n]))
}

async function successfulBy(where: Prisma.RewardPayoutWhereInput) {
  const rows = await db.rewardPayout.groupBy({
    by: ['campaignId'],
    where: { ...where, ...SUCCESSFUL },
    _count: { _all: true },
    _sum: { amountCents: true },
  })
  return new Map(rows.map((r) => [r.campaignId, { n: r._count._all, cents: r._sum.amountCents ?? 0 }]))
}

export async function chargedBy(ids: string[], kinds: LedgerKind[]): Promise<Map<string, number>> {
  const rows = await db.ledgerEntry.groupBy({
    by: ['campaignId'],
    where: { campaignId: { in: ids }, kind: { in: kinds } },
    _sum: { amountCents: true },
  })
  return new Map(rows.map((r) => [r.campaignId ?? '', charged(r._sum.amountCents)]))
}

function splitOf(rows: { via: ShareVia | null; _count: { _all: number } }[]): Record<Split, number> {
  const count = (v: Split) => sum(rows.filter((r) => r.via === v).map((r) => r._count._all))
  return { whatsapp: count('whatsapp'), facebook: count('facebook'), x: count('x'), sms: count('sms') }
}

// 'YYYY-MM-DD' of the market-local day of each of the last `days` days, today last.
function dayLabels(now: Date, days: number, tz: string): string[] {
  const fmtDay = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
  return Array.from({ length: days }, (_, i) => fmtDay.format(new Date(now.getTime() - (days - 1 - i) * DAY_MS)))
}

// Impressions per market-local day: the 13 days before today, then today.
async function dailyImpressions(campaignId: string, tz: string, now: Date): Promise<number[]> {
  const since = new Date(now.getTime() - (DAYS + 1) * DAY_MS)
  const rows = await db.$queryRaw<{ day: string; n: number }[]>`
    SELECT to_char(date_trunc('day', ("at" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS day, count(*)::int AS n
    FROM "ChannelEvent" WHERE "campaignId" = ${campaignId} AND "type" = 'Impression' AND "at" >= ${since}
    GROUP BY 1`
  const byDay = new Map(rows.map((r) => [r.day, r.n]))
  return dayLabels(now, DAYS, tz).map((day) => byDay.get(day) ?? 0)
}

export type Sharer = { phone: string; claims: number }

// The five sharers with the most successful shares. A sharer is the person behind the link: the
// consumer when OshoFree has their phone, else the Phoenix session, so two links of one sharer add up.
async function topSharers(campaignId: string): Promise<Sharer[]> {
  const byLink = await db.rewardPayout.groupBy({
    by: ['shareLinkId'],
    where: { campaignId, ...SUCCESSFUL },
    _count: { _all: true },
  })
  if (!byLink.length) return []
  const claimsOn = new Map(byLink.map((r) => [r.shareLinkId, r._count._all]))
  const links = await db.shareLink.findMany({
    where: { id: { in: [...claimsOn.keys()] } },
    select: { id: true, sharerSessionId: true, consumer: { select: { id: true, phone: true } } },
  })
  const sharers = new Map<string, Sharer>()
  for (const l of links) {
    const key = l.consumer ? `consumer:${l.consumer.id}` : `session:${l.sharerSessionId ?? l.id}`
    const phone = l.consumer ? maskPhone(l.consumer.phone) : REPORT_COPY.phoenixUser((l.sharerSessionId ?? '').slice(-4))
    const seen = sharers.get(key) ?? { phone, claims: 0 }
    sharers.set(key, { phone, claims: seen.claims + (claimsOn.get(l.id) ?? 0) })
  }
  return [...sharers.values()].sort((a, b) => b.claims - a.claims || a.phone.localeCompare(b.phone)).slice(0, 5)
}

// ---- The campaign page and the hero (ADV §1–§2) ----

export type CampaignMetrics = {
  imp: number
  opens: number
  claims: number
  shares: number
  sOpens: number
  sClaims: number
  spendCents: number
  rewardCents: number
  // 14 market-local days, last = today.
  days: number[]
  channels: Record<Split, number>
  topSharers: Sharer[]
  openRate: number
  // Spend (rewards included) ÷ claims; null before the first claim.
  costPerClaimCents: number | null
  // Friend opens ÷ opens.
  viral: number
  // Friend claims ÷ friend opens.
  friendClaimRate: number
}

export async function campaignMetrics(id: string, now: Date): Promise<CampaignMetrics> {
  const { country } = await db.campaign.findUniqueOrThrow({ where: { id }, select: { country: true } })
  const [event, shareRows, friendOpens, successful, spendCents, rewards, days, sharers] = await Promise.all([
    channelEventsBy([id], ['Impression', 'Open', 'Claim']),
    sharesBy([id]),
    friendOpensBy([id]),
    successfulBy({ campaignId: id }),
    campaignSpendCents(id),
    chargedBy([id], ['reward']),
    dailyImpressions(id, MARKETS[country].timezone, now),
    topSharers(id),
  ])
  const imp = event(id, 'Impression')
  const opens = event(id, 'Open')
  const claims = event(id, 'Claim')
  const sOpens = friendOpens.get(id) ?? 0
  const sClaims = successful.get(id)?.n ?? 0
  return {
    imp,
    opens,
    claims,
    shares: sum(shareRows.map((r) => r._count._all)),
    sOpens,
    sClaims,
    spendCents,
    rewardCents: rewards.get(id) ?? 0,
    days,
    channels: splitOf(shareRows),
    topSharers: sharers,
    openRate: ratio(opens, imp),
    costPerClaimCents: claims === 0 ? null : spendCents / claims,
    viral: ratio(sOpens, opens),
    friendClaimRate: ratio(sClaims, sOpens),
  }
}

// ---- Sharing (ADV §5) ----

export type CampaignSharingRow = {
  id: string
  name: string
  brand: string
  country: Country
  shares: number
  sOpens: number
  sClaims: number
  viral: number
  rewardCents: number
}

export type WorkspaceSharing = {
  shares: number
  sOpens: number
  sClaims: number
  rewardCents: number
  opens: number
  campaigns: number
  // Every campaign of the workspace, any status, in list order.
  byCampaign: CampaignSharingRow[]
  // "Where people share": the four media, most shares first, pct of the four's total (0–100).
  channels: { label: string; count: number; pct: number }[]
}

export async function workspaceSharing(workspaceId: string): Promise<WorkspaceSharing> {
  const campaigns = await db.campaign.findMany({
    where: { workspaceId },
    orderBy: LIST_ORDER,
    select: { id: true, name: true, brand: true, country: true },
  })
  const ids = campaigns.map((c) => c.id)
  const [event, shareRows, friendOpens, successful, rewards] = await Promise.all([
    channelEventsBy(ids, ['Open']),
    sharesBy(ids),
    friendOpensBy(ids),
    successfulBy({ campaignId: { in: ids } }),
    chargedBy(ids, ['reward']),
  ])
  const byCampaign = campaigns.map((c) => {
    const sOpens = friendOpens.get(c.id) ?? 0
    return {
      ...c,
      shares: sum(shareRows.filter((r) => r.campaignId === c.id).map((r) => r._count._all)),
      sOpens,
      sClaims: successful.get(c.id)?.n ?? 0,
      viral: ratio(sOpens, event(c.id, 'Open')),
      rewardCents: rewards.get(c.id) ?? 0,
    }
  })
  const split = splitOf(shareRows)
  const splitTotal = sum(Object.values(split))
  const total = (k: 'shares' | 'sOpens' | 'sClaims' | 'rewardCents') => sum(byCampaign.map((r) => r[k]))
  return {
    shares: total('shares'),
    sOpens: total('sOpens'),
    sClaims: total('sClaims'),
    rewardCents: total('rewardCents'),
    opens: sum(ids.map((id) => event(id, 'Open'))),
    campaigns: campaigns.length,
    byCampaign,
    // A stable sort, so ties keep the prototype's order.
    channels: SPLIT.map((v) => ({ label: REPORT_COPY.via[v], count: split[v], pct: ratio(split[v], splitTotal) * 100 })).sort(
      (a, b) => b.count - a.count,
    ),
  }
}

// OshoFree points awarded on the workspace's campaigns (ADV §5 "Points issued").
export async function pointsIssued(workspaceId: string): Promise<number> {
  const { _sum } = await db.pointsLedger.aggregate({ where: { campaign: { workspaceId } }, _sum: { points: true } })
  return _sum.points ?? 0
}

// ---- Campaigns home (ADV §1) ----

const HERO_ORDER: CampaignStatus[] = ['live', 'paused', 'review', 'scheduled']

function pickHero<T extends { status: CampaignStatus }>(listed: T[]): T | null {
  for (const status of HERO_ORDER) {
    const hit = listed.find((c) => c.status === status)
    if (hit) return hit
  }
  return null
}

// The first live campaign in list order; else the first paused, in review, then scheduled. Ended,
// rejected and draft campaigns are never the hero. Statuses are stored, so `now` is not needed.
export const heroCampaign: (workspaceId: string, now?: Date) => Promise<Campaign | null> = async (workspaceId) =>
  pickHero(await db.campaign.findMany({ where: { workspaceId }, orderBy: LIST_ORDER }))

export type CardData = CardModel & { id: string; status: CampaignStatus }

export type HomeCards = {
  // Every campaign of the workspace per pill; the hero is counted.
  counts: Record<HomeFilter, number>
  // Only under All.
  hero: Campaign | null
  // The filter's campaigns in list order; under All without the hero.
  cards: CardData[]
}

const inFilter = (status: CampaignStatus, filter: HomeFilter) => filter === 'all' || status === filter

function mainRow(c: Campaign, imp: number, opens: number): Pick<CardModel, 'mainLeft' | 'mainRight'> {
  const W = REPORT_COPY.card
  switch (c.status) {
    case 'review':
      return { mainLeft: W.awaiting }
    case 'scheduled':
      return { mainLeft: W.starts(fd(c.startsAt, MARKETS[c.country].timezone)) }
    case 'rejected': {
      const reason = c.rejectReasonCode ? rejectReasonText(c.rejectReasonCode, c.rejectReason) : c.rejectReason?.trim()
      return { mainLeft: W.notApproved, ...(reason ? { mainRight: reason } : {}) }
    }
    default:
      return { mainLeft: W.impressions(fmt(imp)), mainRight: W.openRate(pct(opens, imp)) }
  }
}

function cardOf(c: Campaign, m: { imp: number; opens: number; spendCents: number }, now: Date): CardData {
  const running = c.status === 'live' || c.status === 'paused'
  const hasSpendBar = running || c.status === 'ended'
  return {
    id: c.id,
    headline: c.headline,
    brand: c.brand,
    country: MARKETS[c.country].name,
    status: c.status,
    placement: c.placement,
    ageGated: c.ageGated,
    imageUrl: c.creativeImageKey ? imageUrl(c.creativeImageKey) : null,
    color: c.tileColor ?? tokens.tileColors[0],
    initials: initials(c.brand),
    ...(running ? { daysLeft: daysLeft(c.endsAt, now) } : {}),
    ...mainRow(c, m.imp, m.opens),
    ...(hasSpendBar ? { spendPct: ratio(m.spendCents, c.budgetUsd * 100) * 100 } : {}),
  }
}

export async function homeCards(workspaceId: string, filter: HomeFilter, now: Date): Promise<HomeCards> {
  const campaigns = await db.campaign.findMany({ where: { workspaceId }, orderBy: LIST_ORDER })
  const counts = Object.fromEntries(
    HOME_FILTERS.map((f) => [f, campaigns.filter((c) => inFilter(c.status, f)).length]),
  ) as Record<HomeFilter, number>
  const hero = filter === 'all' ? pickHero(campaigns) : null
  const shown = campaigns.filter((c) => inFilter(c.status, filter) && c.id !== hero?.id)
  const ids = shown.map((c) => c.id)
  const [event, spend] = await Promise.all([channelEventsBy(ids, ['Impression', 'Open']), chargedBy(ids, CHARGES)])
  return {
    counts,
    hero,
    cards: shown.map((c) =>
      cardOf(c, { imp: event(c.id, 'Impression'), opens: event(c.id, 'Open'), spendCents: spend.get(c.id) ?? 0 }, now),
    ),
  }
}

async function cardsWhere(where: Prisma.CampaignWhereInput, now: Date): Promise<(CardData & { workspaceId: string })[]> {
  const campaigns = await db.campaign.findMany({ where, orderBy: LIST_ORDER })
  const ids = campaigns.map((c) => c.id)
  const [event, spend] = await Promise.all([channelEventsBy(ids, ['Impression', 'Open']), chargedBy(ids, CHARGES)])
  return campaigns.map((c) => ({
    ...cardOf(c, { imp: event(c.id, 'Impression'), opens: event(c.id, 'Open'), spendCents: spend.get(c.id) ?? 0 }, now),
    workspaceId: c.workspaceId,
  }))
}

// Every live campaign on the platform as its card (GLB §2.1 "Live now"), in list order, with the workspace
// it belongs to.
export const liveCards = (now: Date) => cardsWhere({ status: 'live' }, now)

// Every campaign of one workspace as its card, in list order (Advertisers › workspace › Campaigns).
export const workspaceCards = (workspaceId: string, now: Date) => cardsWhere({ workspaceId }, now)

// ---- Platform (GLB §2.1 block 1, §2.4, §2.5) ----

export type PlatformKpis = {
  // Campaigns live and in review now.
  live: number
  inReview: number
  // All time, every campaign.
  impressions: number
  openRate: number
  // This month: each workspace's own market month containing `now`.
  grossCents: number
  rewardCents: number
  owedCents: number
  keptCents: number
  share: number
}

// Phoenix's share of delivery at `at`; the default share until the channel exists.
const phoenixShare = async (at: Date) => {
  const phoenix = await db.channel.findUnique({ where: { key: PHOENIX }, select: { id: true } })
  return currentShare(phoenix?.id ?? PHOENIX, at)
}

export async function platformKpis(now: Date): Promise<PlatformKpis> {
  const thisMonth: Prisma.LedgerEntryWhereInput[] = COUNTRIES.map((country) => {
    const { start, end } = monthBounds(country, now)
    return { workspace: { country }, at: { gte: start, lt: end } }
  })
  const [live, inReview, event, money, share] = await Promise.all([
    db.campaign.count({ where: { status: 'live' } }),
    db.campaign.count({ where: { status: 'review' } }),
    db.channelEvent.groupBy({ by: ['type'], where: { type: { in: ['Impression', 'Open'] } }, _count: { _all: true } }),
    db.ledgerEntry.groupBy({ by: ['kind'], where: { kind: { in: CHARGES }, OR: thisMonth }, _sum: { amountCents: true } }),
    phoenixShare(now),
  ])
  const events = (type: ChannelEventType) => event.find((e) => e.type === type)?._count._all ?? 0
  const kind = (k: LedgerKind) => charged(money.find((m) => m.kind === k)?._sum.amountCents ?? null)
  const impressions = events('Impression')
  const grossCents = kind('delivery')
  const owedCents = Math.round(grossCents * share)
  return {
    live,
    inReview,
    impressions,
    openRate: ratio(events('Open'), impressions),
    grossCents,
    rewardCents: kind('reward'),
    owedCents,
    keptCents: grossCents - owedCents,
    share,
  }
}

export type SettlementRow = { country: Country; impressions: number; deliveryCents: number; shareCents: number }

// One row per market for the market-local month containing `month`: the channel's impressions and
// the delivery charged on that market's campaigns, and the share in force at the month's last
// instant. Ledger rows carry no channel; every delivery is the one live channel's.
export function settlementByMarket(channelId: string, month: Date): Promise<SettlementRow[]> {
  return Promise.all(
    COUNTRIES.map(async (country) => {
      const { start, end } = monthBounds(country, month)
      const at = { gte: start, lt: end }
      const [impressions, delivery, share] = await Promise.all([
        db.channelEvent.count({ where: { channelId, type: 'Impression', at, campaign: { country } } }),
        db.ledgerEntry.aggregate({ where: { kind: 'delivery', at, campaign: { country } }, _sum: { amountCents: true } }),
        currentShare(channelId, new Date(end.getTime() - 1)),
      ])
      const deliveryCents = charged(delivery._sum.amountCents)
      return { country, impressions, deliveryCents, shareCents: Math.round(deliveryCents * share) }
    }),
  )
}

export type RewardsLedgerRow = {
  campaignId: string
  name: string
  workspaceName: string
  successfulShares: number
  rewardLocal: number
  symbol: string
  // Σ of the successful payouts.
  owedCents: number
  // 'paid' once the campaign has reward lines and every one is on a paid invoice.
  rechargeStatus: 'paid' | 'open'
}

// Every campaign with at least one successful share, ended ones included, in list order.
export async function rewardsLedgerRows(): Promise<RewardsLedgerRow[]> {
  const successful = await successfulBy({})
  const ids = [...successful.keys()]
  if (!ids.length) return []
  const rewardLines = (where: Prisma.LedgerEntryWhereInput) =>
    db.ledgerEntry.groupBy({ by: ['campaignId'], where: { campaignId: { in: ids }, kind: 'reward', ...where }, _count: { _all: true } })
  const [campaigns, lines, paidLines] = await Promise.all([
    db.campaign.findMany({
      where: { id: { in: ids } },
      orderBy: LIST_ORDER,
      select: { id: true, name: true, country: true, rewardLocal: true, workspace: { select: { name: true } } },
    }),
    rewardLines({}),
    rewardLines({ invoice: { status: 'paid' } }),
  ])
  const count = (rows: typeof lines, id: string) => rows.find((r) => r.campaignId === id)?._count._all ?? 0
  return campaigns.map((c) => {
    const all = count(lines, c.id)
    return {
      campaignId: c.id,
      name: c.name,
      workspaceName: c.workspace.name,
      successfulShares: successful.get(c.id)!.n,
      rewardLocal: c.rewardLocal,
      symbol: MARKETS[c.country].symbol,
      owedCents: successful.get(c.id)!.cents,
      rechargeStatus: all > 0 && count(paidLines, c.id) === all ? 'paid' : 'open',
    }
  })
}
