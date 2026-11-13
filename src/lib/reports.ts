import { Prisma, type Campaign, type ShareVia } from '@prisma/client'
import { db } from '@/lib/db'
import { effectiveStatus } from '@/lib/campaign-status'
import { MARKETS } from '@/lib/markets'

const DAY_MS = 24 * 60 * 60 * 1000

export type Funnel = {
  channel: string
  saw: number
  openedOnChannel: number
  claimedOnChannel: number
  claimedViaLink: number
  shares: number
  friendOpened: number
  friendClaimed: number
  detailsLeft: number
}

export type DailyPoint = { day: string; impressions: number; linkOpens: number; claimsOnChannel: number; claimsViaLink: number }

type Medium = ShareVia | 'unknown'
type SharingRow = { shares: number; friendOpens: number; friendClaims: number }
export type Sharing = {
  shares: number
  friendOpens: number
  friendClaims: number
  detailsLeft: number
  deepestChain: number
  viralCoefficient: number | null
  byChannel: ({ channel: string } & SharingRow)[]
  byMedium: ({ via: Medium } & SharingRow)[]
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

async function timezoneOf(campaignId: string): Promise<string> {
  const c = await db.campaign.findUniqueOrThrow({ where: { id: campaignId }, select: { country: true } })
  return MARKETS[c.country].timezone
}

// OshoFree's own counts, per channel and medium, split by tree level. Never mixed with ChannelEvent.
type LinkTally = { channelId: string; via: ShareVia | null; type: string; deduped: boolean; friend: boolean; n: number }
function linkEventTally(campaignIds: string[]): Promise<LinkTally[]> {
  return db.$queryRaw<LinkTally[]>`
    SELECT l."channelId", l."via"::text AS via, e."type"::text AS type, e."deduped",
           (l."depth" >= 1) AS friend, count(*)::int AS n
    FROM "LinkEvent" e JOIN "ShareLink" l ON l."id" = e."linkId"
    WHERE l."campaignId" IN (${Prisma.join(campaignIds)})
    GROUP BY 1, 2, 3, 4, 5`
}

async function channelKeys(ids: string[]): Promise<Map<string, string>> {
  const rows = await db.channel.findMany({ where: { id: { in: ids } }, select: { id: true, key: true } })
  return new Map(rows.map((r) => [r.id, r.key]))
}

export async function campaignFunnel(campaignId: string): Promise<Funnel[]> {
  const roots = await db.shareLink.findMany({ where: { campaignId, sharerType: 'Root' }, select: { channelId: true } })
  const channelIds = [...new Set(roots.map((r) => r.channelId))]
  const [keys, events, shareRows, tally] = await Promise.all([
    channelKeys(channelIds),
    db.channelEvent.groupBy({ by: ['channelId', 'type'], where: { campaignId, channelId: { in: channelIds } }, _count: { _all: true } }),
    db.shareLink.groupBy({ by: ['channelId'], where: { campaignId, sharerType: { not: 'Root' } }, _count: { _all: true } }),
    linkEventTally([campaignId]),
  ])
  const onChannel = (id: string, type: string) =>
    events.find((e) => e.channelId === id && e.type === type)?._count._all ?? 0
  const viaLink = (id: string, type: string, o: { friend?: boolean; counted?: boolean } = {}) =>
    sum(
      tally
        .filter((t) => t.channelId === id && t.type === type && (!o.friend || t.friend) && (!o.counted || !t.deduped))
        .map((t) => t.n),
    )
  return channelIds
    .map((id) => ({
      channel: keys.get(id) ?? id,
      saw: onChannel(id, 'Impression'),
      openedOnChannel: onChannel(id, 'Open'),
      claimedOnChannel: onChannel(id, 'Claim'),
      claimedViaLink: viaLink(id, 'Claim'),
      shares: shareRows.find((s) => s.channelId === id)?._count._all ?? 0,
      friendOpened: viaLink(id, 'Open', { friend: true, counted: true }),
      friendClaimed: viaLink(id, 'Claim', { friend: true }),
      detailsLeft: viaLink(id, 'DetailsLeft', { friend: true }),
    }))
    .sort((a, b) => a.channel.localeCompare(b.channel))
}

function dayLabels(now: Date, days: number, tz: string): string[] {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
  return Array.from({ length: days }, (_, i) => fmt.format(new Date(now.getTime() - (days - 1 - i) * DAY_MS)))
}

export async function campaignDaily(campaignId: string, days = 14, now: Date = new Date()): Promise<DailyPoint[]> {
  const tz = await timezoneOf(campaignId)
  const labels = dayLabels(now, days, tz)
  const since = new Date(now.getTime() - (days + 1) * DAY_MS)
  const [channel, link] = await Promise.all([
    db.$queryRaw<{ day: string; type: string; n: number }[]>`
      SELECT to_char(date_trunc('day', ("at" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS day, "type"::text AS type, count(*)::int AS n
      FROM "ChannelEvent" WHERE "campaignId" = ${campaignId} AND "at" >= ${since} AND "type" IN ('Impression', 'Claim')
      GROUP BY 1, 2`,
    db.$queryRaw<{ day: string; type: string; n: number }[]>`
      SELECT to_char(date_trunc('day', (e."at" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS day, e."type"::text AS type, count(*)::int AS n
      FROM "LinkEvent" e JOIN "ShareLink" l ON l."id" = e."linkId"
      WHERE l."campaignId" = ${campaignId} AND e."at" >= ${since}
        AND ((e."type" = 'Open' AND e."deduped" = false) OR e."type" = 'Claim')
      GROUP BY 1, 2`,
  ])
  const n = (rows: { day: string; type: string; n: number }[], day: string, type: string) =>
    rows.find((r) => r.day === day && r.type === type)?.n ?? 0
  return labels.map((day) => ({
    day,
    impressions: n(channel, day, 'Impression'),
    linkOpens: n(link, day, 'Open'),
    claimsOnChannel: n(channel, day, 'Claim'),
    claimsViaLink: n(link, day, 'Claim'),
  }))
}

async function sharingFor(campaignIds: string[]): Promise<Sharing> {
  if (campaignIds.length === 0) return emptySharing()
  const [links, tally] = await Promise.all([
    db.shareLink.groupBy({
      by: ['channelId', 'via'],
      where: { campaignId: { in: campaignIds }, sharerType: { not: 'Root' } },
      _count: { _all: true },
    }),
    linkEventTally(campaignIds),
  ])
  const deepest = await db.shareLink.aggregate({ where: { campaignId: { in: campaignIds } }, _max: { depth: true } })
  const friendOnly = tally.filter((t) => t.friend)
  const count = (rows: LinkTally[], type: string) =>
    sum(rows.filter((t) => t.type === type && (type !== 'Open' || !t.deduped)).map((t) => t.n))
  const row = (match: (x: { channelId: string; via: ShareVia | null }) => boolean): SharingRow => ({
    shares: sum(links.filter(match).map((l) => l._count._all)),
    friendOpens: count(friendOnly.filter(match), 'Open'),
    friendClaims: count(friendOnly.filter(match), 'Claim'),
  })
  const keys = await channelKeys([...new Set(links.map((l) => l.channelId))])
  const mediums = [...new Set(links.map((l) => l.via ?? 'unknown'))] as Medium[]
  const shares = sum(links.map((l) => l._count._all))
  const friendClaims = count(friendOnly, 'Claim')
  return {
    shares,
    friendOpens: count(friendOnly, 'Open'),
    friendClaims,
    detailsLeft: count(friendOnly, 'DetailsLeft'),
    deepestChain: deepest._max.depth ?? 0,
    viralCoefficient: shares === 0 ? null : friendClaims / shares,
    byChannel: [...keys]
      .map(([id, channel]) => ({ channel, ...row((x) => x.channelId === id) }))
      .sort((a, b) => a.channel.localeCompare(b.channel)),
    byMedium: mediums
      .map((via) => ({ via, ...row((x) => (x.via ?? 'unknown') === via) }))
      .sort((a, b) => a.via.localeCompare(b.via)),
  }
}

function emptySharing(): Sharing {
  return { shares: 0, friendOpens: 0, friendClaims: 0, detailsLeft: 0, deepestChain: 0, viralCoefficient: null, byChannel: [], byMedium: [] }
}

export const campaignSharing = (campaignId: string) => sharingFor([campaignId])

export async function workspaceSharing(workspaceId: string): Promise<Sharing> {
  const campaigns = await db.campaign.findMany({ where: { workspaceId }, select: { id: true } })
  return sharingFor(campaigns.map((c) => c.id))
}

export async function homeNumbers(campaignId: string, now: Date) {
  const campaign = await db.campaign.findUniqueOrThrow({ where: { id: campaignId } })
  const tz = MARKETS[campaign.country].timezone
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const [impressions, todayRows, claimedOnChannel, tally, shares] = await Promise.all([
    db.channelEvent.count({ where: { campaignId, type: 'Impression' } }),
    db.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM "ChannelEvent"
      WHERE "campaignId" = ${campaignId} AND "type" = 'Impression'
        AND to_char(date_trunc('day', ("at" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}), 'YYYY-MM-DD') = ${today}`,
    db.channelEvent.count({ where: { campaignId, type: 'Claim' } }),
    linkEventTally([campaignId]),
    db.shareLink.count({ where: { campaignId, sharerType: { not: 'Root' } } }),
  ])
  const viaLink = (type: string, countedOnly = false) =>
    sum(tally.filter((t) => t.type === type && (!countedOnly || !t.deduped)).map((t) => t.n))
  const daysTotal = Math.floor((campaign.endsAt.getTime() - campaign.startsAt.getTime()) / DAY_MS)
  const elapsed = Math.floor((now.getTime() - campaign.startsAt.getTime()) / DAY_MS)
  return {
    impressions,
    impressionsToday: todayRows[0]?.n ?? 0,
    uniqueLinkOpens: viaLink('Open', true),
    shares,
    claims: claimedOnChannel + viaLink('Claim'),
    daysElapsed: Math.min(Math.max(elapsed, 0), daysTotal),
    daysTotal,
  }
}

export async function heroCampaign(workspaceId: string, now: Date): Promise<Campaign | null> {
  const campaigns = await db.campaign.findMany({ where: { workspaceId }, orderBy: { startsAt: 'desc' } })
  for (const status of ['live', 'paused', 'review']) {
    const hit = campaigns.find((c) => effectiveStatus(c, now) === status)
    if (hit) return hit
  }
  return null
}
