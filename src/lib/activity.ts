import { Prisma, type Campaign, type PayoutStatus, type RedeemMethod, type ShareVia } from '@prisma/client'
import { ACTIVITY as A, SHARERS as S } from '@/lib/copy-activity'
import { db } from '@/lib/db'
import type { ActivityLine } from '@/lib/activity-keys'
import { fdt, hm, localAmount, maskPhone } from '@/lib/format'
import { MARKETS, type Country } from '@/lib/markets'

// What happened on a campaign, one line per recorded event (Prompt 8), read-only. Nothing here writes, and every
// line comes from a row the journey already stores:
//   impressions   ChannelEvent Impression, one line per channel per UTC hour (the hour ingestion dedupes by; the
//                 events carry no batch id, so the hour is the batch)
//   open, claim   ChannelEvent Open / Claim; a claim carries the code POST /claims issued that session that day
//   claim (code)  a ClaimCode with no claim event and no offer-page claim behind it (Phoenix asked, never posted)
//   follow        LinkEvent Claim on the campaign's own (Root) link: the click-through to a link offer, or a code
//                 taken on that page; pageOpen is an Open there, deduped rows left out
//   share         a sharer's ShareLink that went out on a medium; ownLink, a friend's own link not shared on yet. A
//                 link's moment is its earliest record: the row, Phoenix's share event for its token, or the
//                 details its friend left
//   friendOpen    LinkEvent Open on a sharer's link, deduped rows left out (the report's "Friends opened")
//   friendClaim   a friend's first Claim on a sharer's link: the one its RewardPayout is keyed by
//   reward        RewardPayout, at its current status and reason
//   points        PointsLedger, a take-back included
// Phoenix's share_open / share_claim and share events are the channel's own stats (spec §6.14.2) and are not lines.
// Phones are masked here and nowhere later; a line's ids are only its tooltip.
//
// Pages are keyset, not offset: a page is the PAGE lines below a cursor (a line's key, found again from its row), and
// every source reads at most PAGE + 1 rows from the cursor, newest first (ChannelEvent by its (campaign, type, at)
// index; impressions by walking back an hour at a time), so a page costs the same however much a campaign has recorded.

export const PAGE = 30
// The most sharers the Sharing page lists at once; its Show more grows by PAGE up to it.
export const MAX_SHARERS = 3000

export type Kind =
  | 'impressions' | 'open' | 'claim' | 'follow' | 'pageOpen' | 'share' | 'ownLink' | 'friendOpen' | 'friendClaim' | 'reward' | 'points'

export { isLineKey, lineAnchor, type ActivityLine } from '@/lib/activity-keys'

type Row = {
  kind: Kind
  at: Date
  rank: number
  key: string
  ids: string
  campaignId: string
  channelId: string | null
  n: number | null
  hour: Date | null
  // An impressions line's count and channels (countHours).
  count?: number | null
  channels?: string[] | null
  via: ShareVia | null
  sharer: string | null
  sharerPhone: string | null
  sharerSession: string | null
  parent: string | null
  parentPhone: string | null
  parentSession: string | null
  status: PayoutStatus | null
  reason: string | null
  amount: number | null
  points: number | null
}

// Every branch selects these columns, in this order and type, so they can be unioned.
const COLS = [
  ['kind', 'text'], ['at', 'timestamp(3)'], ['rank', 'int'], ['key', 'text'], ['ids', 'text'], ['campaignId', 'text'],
  ['channelId', 'text'], ['n', 'int'], ['hour', 'timestamp(3)'], ['via', 'text'], ['sharer', 'text'], ['sharerPhone', 'text'],
  ['sharerSession', 'text'], ['parent', 'text'], ['parentPhone', 'text'], ['parentSession', 'text'], ['status', 'text'],
  ['reason', 'text'], ['amount', 'int'], ['points', 'int'],
] as const satisfies readonly (readonly [keyof Row, string])[]

type Cols = Partial<Record<keyof Row, Prisma.Sql>>
const sql = Prisma.sql
const raw = Prisma.raw

function select(c: Cols): Prisma.Sql {
  return Prisma.join(COLS.map(([name, type]) => sql`(${c[name] ?? raw('NULL')})::${raw(type)} AS ${raw(`"${name}"`)}`), ', ')
}

// The person behind a link or a payout: their number's Consumer when OshoFree has it, else the session that shared.
const linkSharer = (l: string) =>
  raw(`CASE WHEN ${l}."consumerId" IS NOT NULL THEN 'c:' || ${l}."consumerId" ELSE 's:' || COALESCE(${l}."sharerSessionId", ${l}."id") END`)
const linkSession = (l: string) => raw(`COALESCE(${l}."sharerSessionId", ${l}."id")`)
// The ClaimCode a claim's session (or offer-page visitor) was issued on the claim's UTC day, on its channel.
const codeOf = (e: string, campaign: string, channel: string, session: string) =>
  raw(`LEFT JOIN "ClaimCode" cc ON ${e}."type" = 'Claim' AND cc."campaignId" = ${campaign} AND cc."channelId" = ${channel}
    AND cc."sessionId" = ${session} AND cc."day" = date_trunc('day', ${e}."at")`)

type Ids = Prisma.Sql

// One source of lines: what it selects, where from, and the line's moment, rank and key as expressions, so a page can
// bound the branch on its own (cursor, ORDER BY, LIMIT) and a key can be found again by its row id.
type Branch = {
  // The key's prefix ("reward" in reward-<id>) and the id column after it.
  prefix: string
  id: Prisma.Sql
  at: Prisma.Sql
  // A constant rank stays out of the branch's ORDER BY (a bare integer there would name a column).
  rank: number | Prisma.Sql
  key: Prisma.Sql
  cols: Cols
  // A source that can cut its own page before its lookups (links) builds its FROM from the page.
  from: Prisma.Sql | ((page: Page | undefined, only: string | undefined) => Prisma.Sql)
  where: Prisma.Sql
}

type Page = { n: number; cursor: Cursor | null }

// Where a page starts: below a line (Show more, ?before=) or at it (a link to one line, ?line=).
type Cursor = { at: Date; rank: number; key: string; inclusive: boolean }

const rankSql = (b: Branch) => (typeof b.rank === 'number' ? raw(String(b.rank)) : b.rank)

// The branch's rows; with a page, only the n before the cursor, newest first (an index scan that stops for
// ChannelEvent, a top-n sort for the small tables); with `only`, the one row with that id.
// The conditions that put a row below (or at) the cursor: a plain bound on the moment for the index, then the exact
// order.
function belowCursor(at: Prisma.Sql, rank: Prisma.Sql, key: Prisma.Sql, c: Cursor | null | undefined): Prisma.Sql[] {
  if (!c) return []
  return [
    sql`${at} <= ${c.at}`,
    c.inclusive ? sql`(${at}, ${rank}, ${key}) <= (${c.at}, ${c.rank}, ${c.key})` : sql`(${at}, ${rank}, ${key}) < (${c.at}, ${c.rank}, ${c.key})`,
  ]
}

function branchSql(b: Branch, page?: Page, only?: string): Prisma.Sql {
  const rank = rankSql(b)
  const where = [b.where, ...belowCursor(b.at, rank, b.key, page?.cursor)]
  if (only !== undefined) where.push(sql`${b.id} = ${only}`)
  const from = typeof b.from === 'function' ? b.from(page, only) : b.from
  const body = sql`SELECT ${select({ ...b.cols, at: b.at, rank, key: b.key })} ${from} WHERE ${Prisma.join(where, ' AND ')}`
  if (!page) return body
  const order = typeof b.rank === 'number' ? sql`${b.at} DESC, ${b.key} DESC` : sql`${b.at} DESC, ${rank} DESC, ${b.key} DESC`
  return sql`(${body} ORDER BY ${order} LIMIT ${page.n})`
}

const channelEvents = (type: 'Open' | 'Claim') => (ids: Ids): Branch => ({
  prefix: type === 'Open' ? 'open' : 'claim',
  id: sql`e."id"`,
  at: sql`e."at"`,
  rank: type === 'Open' ? 1 : 2,
  key: type === 'Open' ? sql`'open-' || e."id"` : sql`'claim-' || e."id"`,
  cols: {
    kind: type === 'Open' ? sql`'open'` : sql`'claim'`, ids: sql`concat_ws(' · ', e."id", cc."id")`,
    campaignId: sql`e."campaignId"`, channelId: sql`e."channelId"`,
  },
  from: sql`FROM "ChannelEvent" e ${codeOf('e', 'e."campaignId"', 'e."channelId"', 'e."sessionId"')}`,
  where: type === 'Open'
    ? sql`e."campaignId" IN (${ids}) AND e."type" = 'Open'`
    : sql`e."campaignId" IN (${ids}) AND e."type" = 'Claim'`,
})

// Codes with no claim event that day and no offer-page claim by that visitor: the code is the only record.
const codes = (ids: Ids): Branch => ({
  prefix: 'code', id: sql`cc."id"`, at: sql`cc."createdAt"`, rank: 2, key: sql`'code-' || cc."id"`,
  cols: { kind: sql`'claim'`, ids: sql`cc."id"`, campaignId: sql`cc."campaignId"`, channelId: sql`cc."channelId"` },
  from: sql`FROM "ClaimCode" cc`,
  where: sql`cc."campaignId" IN (${ids})
    AND NOT EXISTS (SELECT 1 FROM "ChannelEvent" e WHERE e."campaignId" = cc."campaignId" AND e."type" = 'Claim'
      AND e."channelId" = cc."channelId" AND e."sessionId" = cc."sessionId" AND date_trunc('day', e."at") = cc."day")
    AND NOT EXISTS (SELECT 1 FROM "LinkEvent" v JOIN "ShareLink" vl ON vl."id" = v."linkId"
      WHERE vl."campaignId" = cc."campaignId" AND v."type" = 'Claim' AND v."visitorId" = cc."sessionId")`,
})

// The campaign's own link: Phoenix's click-through (or a code taken on its page) and opens of its page.
const rootEvents = (ids: Ids): Branch => ({
  prefix: 'root', id: sql`e."id"`, at: sql`e."at"`, rank: sql`CASE e."type" WHEN 'Claim' THEN 2 ELSE 1 END`,
  key: sql`'root-' || e."id"`,
  cols: {
    kind: sql`CASE e."type" WHEN 'Claim' THEN 'follow' ELSE 'pageOpen' END`, ids: sql`concat_ws(' · ', e."id", cc."id")`,
    campaignId: sql`l."campaignId"`, channelId: sql`l."channelId"`,
  },
  from: sql`FROM "LinkEvent" e JOIN "ShareLink" l ON l."id" = e."linkId"
  ${codeOf('e', 'l."campaignId"', 'l."channelId"', 'e."visitorId"')}`,
  where: sql`l."campaignId" IN (${ids}) AND l."depth" = 0 AND (e."type" = 'Claim' OR (e."type" = 'Open' AND e."deduped" = false))`,
})

// Sharers' links: one that went out on a medium is a share; a friend's own link not shared on yet is still a line. The
// link's moment is worked out first (its row, its token's share event, its details) and its people looked up after, so
// a page sorts the links alone and looks up only the ones it keeps.
const links = (ids: Ids): Branch => ({
  prefix: 'link', id: sql`l."id"`, at: sql`l."moment"`, rank: 3, key: sql`'link-' || l."id"`,
  cols: {
    kind: sql`CASE WHEN l."via" IS NULL THEN 'ownLink' ELSE 'share' END`,
    ids: sql`concat_ws(' · ', l."id", l."shareEventId", l."detailsId")`, campaignId: sql`l."campaignId"`, channelId: sql`l."channelId"`,
    via: sql`l."via"`, sharer: linkSharer('l'), sharerPhone: sql`c."phone"`, sharerSession: linkSession('l'),
    parent: sql`CASE WHEN pa."sharerType" = 'Root' THEN NULL ELSE ${linkSharer('pa')} END`, parentPhone: sql`pc."phone"`,
    parentSession: sql`CASE WHEN pa."sharerType" = 'Root' THEN NULL ELSE ${linkSession('pa')} END`,
  },
  from: (page, only) => {
    const moment = sql`LEAST(l."createdAt", se."at", dt."at")`
    const key = sql`'link-' || l."id"`
    const where = [
      sql`l."campaignId" IN (${ids}) AND l."sharerType" <> 'Root' AND (l."via" IS NOT NULL OR l."sharerType" = 'Consumer')`,
      ...belowCursor(moment, raw('3'), key, page?.cursor),
      ...(only !== undefined ? [sql`l."id" = ${only}`] : []),
    ]
    return sql`FROM (
    SELECT l.*, ${moment} AS "moment", se."id" AS "shareEventId", dt."id" AS "detailsId"
    FROM "ShareLink" l
    LEFT JOIN (
      -- Ingestion keeps a token's share event only on that token's channel and campaign, so the token alone joins it.
      SELECT DISTINCT ON ("linkCode") "linkCode", "at", "id"
      FROM "ChannelEvent" WHERE "campaignId" IN (${ids}) AND "type" = 'Share' AND "linkCode" IS NOT NULL
      ORDER BY "linkCode", "at", "id"
    ) se ON se."linkCode" = l."code"
    LEFT JOIN (
      SELECT DISTINCT ON (d."linkId", d."visitorId") d."linkId", d."visitorId", d."at", d."id"
      FROM "LinkEvent" d JOIN "ShareLink" dl ON dl."id" = d."linkId"
      WHERE dl."campaignId" IN (${ids}) AND d."type" = 'DetailsLeft'
      ORDER BY d."linkId", d."visitorId", d."at", d."id"
    ) dt ON l."sharerType" = 'Consumer' AND dt."linkId" = l."parentId" AND dt."visitorId" = l."sharerSessionId"
    WHERE ${Prisma.join(where, ' AND ')}
    ${page ? sql`ORDER BY ${moment} DESC, ${key} DESC LIMIT ${page.n}` : sql``}
  ) l
  LEFT JOIN "ShareLink" pa ON pa."id" = l."parentId"
  LEFT JOIN "Consumer" c ON c."id" = l."consumerId"
  LEFT JOIN "Consumer" pc ON pc."id" = pa."consumerId"`
  },
  where: sql`true`,
})

const friendOpens = (ids: Ids): Branch => ({
  prefix: 'fo', id: sql`e."id"`, at: sql`e."at"`, rank: 4, key: sql`'fo-' || e."id"`,
  cols: {
    kind: sql`'friendOpen'`, ids: sql`e."id"`, campaignId: sql`l."campaignId"`, channelId: sql`l."channelId"`,
    sharer: linkSharer('l'), sharerPhone: sql`c."phone"`, sharerSession: linkSession('l'),
  },
  from: sql`FROM "LinkEvent" e JOIN "ShareLink" l ON l."id" = e."linkId" LEFT JOIN "Consumer" c ON c."id" = l."consumerId"`,
  where: sql`l."campaignId" IN (${ids}) AND l."depth" >= 1 AND e."type" = 'Open' AND e."deduped" = false`,
})

// A friend's first claim on a sharer's link is the one a payout is keyed by; a repeat claim earns nothing and is no line.
const friendClaims = (ids: Ids): Branch => ({
  prefix: 'fc', id: sql`e."id"`, at: sql`e."at"`, rank: 5, key: sql`'fc-' || e."id"`,
  cols: {
    kind: sql`'friendClaim'`, ids: sql`concat_ws(' · ', e."id", p."id", cc."id")`, campaignId: sql`l."campaignId"`,
    channelId: sql`l."channelId"`, sharer: linkSharer('l'), sharerPhone: sql`c."phone"`, sharerSession: linkSession('l'),
    status: sql`p."status"`, reason: sql`p."reason"`, amount: sql`p."amountLocal"`,
  },
  from: sql`FROM "LinkEvent" e JOIN "ShareLink" l ON l."id" = e."linkId" JOIN "RewardPayout" p ON p."claimEventKey" = e."id"
  LEFT JOIN "Consumer" c ON c."id" = l."consumerId"
  ${codeOf('e', 'l."campaignId"', 'l."channelId"', 'e."visitorId"')}`,
  where: sql`l."campaignId" IN (${ids}) AND l."depth" >= 1 AND e."type" = 'Claim'`,
})

const rewards = (ids: Ids): Branch => ({
  prefix: 'reward', id: sql`p."id"`, at: sql`p."createdAt"`, rank: 6, key: sql`'reward-' || p."id"`,
  cols: {
    kind: sql`'reward'`, ids: sql`p."id"`, campaignId: sql`p."campaignId"`,
    sharer: sql`CASE WHEN p."sharerConsumerId" IS NOT NULL THEN 'c:' || p."sharerConsumerId" ELSE 's:' || COALESCE(p."sharerSessionId", p."shareLinkId") END`,
    sharerPhone: sql`c."phone"`, sharerSession: sql`COALESCE(p."sharerSessionId", p."shareLinkId")`,
    status: sql`p."status"`, reason: sql`p."reason"`, amount: sql`p."amountLocal"`,
  },
  from: sql`FROM "RewardPayout" p LEFT JOIN "Consumer" c ON c."id" = p."sharerConsumerId"`,
  where: sql`p."campaignId" IN (${ids})`,
})

const points = (ids: Ids): Branch => ({
  prefix: 'points', id: sql`pl."id"`, at: sql`pl."createdAt"`, rank: 7, key: sql`'points-' || pl."id"`,
  cols: {
    kind: sql`'points'`, ids: sql`pl."id"`, campaignId: sql`pl."campaignId"`, sharerPhone: sql`c."phone"`,
    sharerSession: sql`pl."sharerSessionId"`, points: sql`pl."points"`,
  },
  from: sql`FROM "PointsLedger" pl LEFT JOIN "Consumer" c ON c."id" = pl."consumerId"`,
  where: sql`pl."campaignId" IN (${ids})`,
})

// Every source but impressions, which are walked hour by hour (impressionsPage).
const EVENTS = [channelEvents('Open'), channelEvents('Claim'), codes, rootEvents, links, friendOpens, friendClaims, rewards, points]
const SHARING = [links, friendOpens, friendClaims, rewards]

// One campaign's impressions as hour lines (one per UTC hour, the hour ingestion dedupes by), a page at a time, without
// reading the impressions themselves: a recursive walk steps back an hour at a time from the cursor (each step one
// index probe: the newest impression before the hour found last), and each walked hour's newest impression (one more
// probe) is the line's moment. Only the hours that make the page are counted, after the page is cut (countHours). A
// page needs at most n hours, plus the hour the cursor sits in, whose line may already have been shown.
function impressionsPage(campaignId: string, n: number, c: Cursor | null): { walk: Prisma.Sql; part: Prisma.Sql } {
  const latest = (bound: Prisma.Sql) =>
    sql`date_trunc('hour', (SELECT max(e."at") FROM "ChannelEvent" e WHERE e."campaignId" = ${campaignId} AND e."type" = 'Impression' ${bound}))`
  const walk = sql`walk(h, n) AS (
    SELECT ${latest(c ? sql`AND e."at" <= ${c.at}` : sql``)}, 1
    UNION ALL
    SELECT ${latest(sql`AND e."at" < w.h`)}, w.n + 1 FROM walk w WHERE w.h IS NOT NULL AND w.n < ${n + 1}
  )`
  const key = sql`'imp-' || to_char(w.h, 'YYYYMMDDHH24')`
  const after = !c ? sql``
    : c.inclusive ? sql`AND (hx."at", 0, ${key}) <= (${c.at}, ${c.rank}, ${c.key})`
    : sql`AND (hx."at", 0, ${key}) < (${c.at}, ${c.rank}, ${c.key})`
  const part = sql`(SELECT ${select({
    kind: sql`'impressions'`, at: sql`hx."at"`, rank: sql`0`, key,
    // The hour as ingestion writes it at the end of the events' dedupe keys.
    ids: sql`'Impression:' || to_char(w.h, 'YYYY-MM-DD"T"HH24":00:00.000Z"')`,
    campaignId: sql`${campaignId}`, hour: sql`w.h`,
  })}
  FROM walk w CROSS JOIN LATERAL (
    SELECT max(e."at") AS "at" FROM "ChannelEvent" e
    WHERE e."campaignId" = ${campaignId} AND e."type" = 'Impression' AND e."at" >= w.h AND e."at" < w.h + interval '1 hour'
  ) hx
  WHERE w.h IS NOT NULL ${after}
  ORDER BY hx."at" DESC LIMIT ${n})`
  return { walk, part }
}

// The count and channels of each impressions hour a page shows (the only impressions any page reads).
const countHours = (campaignId: string) => sql`LEFT JOIN LATERAL (
  SELECT count(*)::int AS "count", array_agg(DISTINCT e."channelId") AS "channels" FROM "ChannelEvent" e
  WHERE a."kind" = 'impressions' AND e."campaignId" = ${campaignId} AND e."type" = 'Impression'
    AND e."at" >= a."hour" AND e."at" < a."hour" + interval '1 hour'
) x ON true`

// Runs a read with JIT off. These reads are index probes and small sorts; their estimates would switch on JIT, whose
// compiling costs more than the query (130 ms of 197 ms on a scale-1 page before this).
async function quick<T>(query: Prisma.Sql): Promise<T> {
  const [, rows] = await db.$transaction([db.$executeRaw`SET LOCAL jit = off`, db.$queryRaw<T>(query)])
  return rows
}

// Newest first; at one instant the effect before its cause (points, reward, then the claim that earned them).
const ORDER = raw(`"at" DESC, "rank" DESC, "key" DESC`)

// ---- One line's words ----

type Campaignish = { country: Country; redeemMethod: RedeemMethod }

function who(phone: string | null, session: string | null): string {
  if (phone) return maskPhone(phone)
  return session ? A.phoenixUser(session.slice(-4)) : A.someone
}

const reasonText = (reason: string | null) => (reason ? (A.reasons[reason] ?? reason) : null)

function what(r: Row, c: Campaignish, channel: string): string {
  const sharer = who(r.sharerPhone, r.sharerSession)
  const parent = r.parent ? who(r.parentPhone, r.parentSession) : null
  const amount = () => localAmount(r.amount ?? 0, c.country)
  switch (r.kind) {
    case 'impressions':
      return A.impressions(r.count ?? r.n ?? 0, channel)
    case 'open':
      return A.open(channel)
    case 'claim':
      return A.claim[c.redeemMethod](channel)
    case 'follow':
      return A.follow[c.redeemMethod]()
    case 'pageOpen':
      return A.pageOpen
    case 'share':
    case 'ownLink': {
      const line = r.kind === 'share' ? A.share(sharer, A.via[r.via!]) : A.ownLink(sharer)
      return parent ? A.friendOf(line, parent) : line
    }
    case 'friendOpen':
      return A.friendOpen(sharer)
    case 'friendClaim':
      return A.friendClaim[c.redeemMethod](sharer)
    case 'reward':
      return A.reward(amount(), sharer, r.status!, r.status === 'queued' || r.status === 'sent' ? null : reasonText(r.reason))
    case 'points':
      return A.points(r.points ?? 0, sharer)
  }
}

function when(r: Row, tz: string): string {
  if (r.kind !== 'impressions' || !r.hour) return fdt(r.at, tz)
  return A.hour(fdt(r.hour, tz), hm(new Date(r.hour.getTime() + 3_600_000), tz))
}

async function channelNames(): Promise<(id: string | null) => string> {
  const channels = await db.channel.findMany({ select: { id: true, key: true, name: true } })
  const names = new Map(channels.map((c) => [c.id, A.channels[c.key] ?? c.name]))
  return (id) => (id && names.get(id)) || A.channels.phoenix
}

const lineOf = (r: Row, c: Campaignish, channel: string): ActivityLine => ({
  key: r.key,
  text: A.line(what(r, c, channel), when(r, MARKETS[c.country].timezone)),
  title: r.ids,
})

// The Sharing page's Show more asks for one more page of sharers each time: a whole number of pages, at least one.
export function sharersWanted(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value)
  if (!Number.isFinite(n) || n < PAGE) return PAGE
  return Math.min(MAX_SHARERS, Math.ceil(n / PAGE) * PAGE)
}

// Where a line sits in the order (its moment, rank and key), found from its key alone: the row it was made from, or for
// an hour of impressions the newest impression in that hour. Null when the campaign has no such line.
async function locate(campaignId: string, key: string): Promise<Omit<Cursor, 'inclusive'> | null> {
  const hour = /^imp-(\d{4})(\d\d)(\d\d)(\d\d)$/.exec(key)
  if (hour) {
    const [, y, mo, d, h] = hour
    const from = new Date(Date.UTC(+y, +mo - 1, +d, +h))
    const [row] = await db.$queryRaw<{ at: Date | null }[]>`
      SELECT max("at") AS "at" FROM "ChannelEvent" WHERE "campaignId" = ${campaignId} AND "type" = 'Impression'
        AND "at" >= ${from} AND "at" < ${new Date(from.getTime() + 3_600_000)}`
    return row?.at ? { at: row.at, rank: 0, key } : null
  }
  const dash = key.indexOf('-')
  const branch = EVENTS.map((b) => b(Prisma.join([campaignId]))).find((b) => b.prefix === key.slice(0, dash))
  if (!branch || dash < 0) return null
  const rows = await db.$queryRaw<Row[]>(branchSql(branch, undefined, key.slice(dash + 1)))
  const row = rows.find((r) => r.key === key)
  return row ? { at: row.at, rank: row.rank, key } : null
}

export type CampaignActivity = {
  lines: ActivityLine[]
  // The key Show more passes as ?before= for the next page; null at the oldest line.
  next: string | null
  // The line a link asked for, when this page shows it (it is lit).
  line: string | null
  // The page starts below the newest line (at a linked line, or past Show more): it offers "Newest".
  windowed: boolean
}

// One page of the campaign's lines, newest first: the newest PAGE, or those below `before` (Show more), or those
// from `line` down (a link to one line: Global's held rewards). Keyset, not offset: each source reads at most a page
// from the cursor, so a page costs the same however much the campaign has recorded. A key the campaign does not have
// is ignored.
export async function campaignActivity(
  c: Pick<Campaign, 'id'> & Campaignish,
  opts: { before?: string | null; line?: string | null } = {},
): Promise<CampaignActivity> {
  let cursor: Cursor | null = null
  if (opts.before) {
    const found = await locate(c.id, opts.before)
    if (found) cursor = { ...found, inclusive: false }
  } else if (opts.line) {
    const found = await locate(c.id, opts.line)
    if (found) cursor = { ...found, inclusive: true }
  }
  const n = PAGE + 1
  const ids = Prisma.join([c.id])
  const imp = impressionsPage(c.id, n, cursor)
  const parts = [imp.part, ...EVENTS.map((b) => branchSql(b(ids), { n, cursor }))]
  const page = sql`WITH RECURSIVE ${imp.walk}
    SELECT a.*, x."count", x."channels"
    FROM (SELECT * FROM (${Prisma.join(parts, ' UNION ALL ')}) u ORDER BY ${ORDER} LIMIT ${n}) a ${countHours(c.id)}
    ORDER BY ${ORDER}`
  const [rows, channel] = await Promise.all([quick<Row[]>(page), channelNames()])
  // An hour of impressions names every channel they came from; any other line its own.
  const channelOf = (r: Row) => (r.channels?.length ? A.channelList(r.channels.map(channel)) : channel(r.channelId))
  const lines = rows.slice(0, PAGE).map((r) => lineOf(r, c, channelOf(r)))
  return {
    lines,
    next: rows.length > PAGE ? lines[lines.length - 1].key : null,
    line: opts.line && lines.some((l) => l.key === opts.line) ? opts.line : null,
    windowed: cursor !== null,
  }
}

// ---- The Sharing page's sharers ----

export type SharerRow = {
  // campaign id + sharer: unique on the page.
  key: string
  campaignId: string
  campaign: string
  who: string
  // The sharer whose link brought them, for a friend who got a link of their own.
  friendOf: string | null
  // "WhatsApp, SMS", or null before they shared on a medium.
  via: string | null
  opened: number
  claimed: number
  // "₦50 queued · ₦100 sent", or null before any reward.
  rewards: string | null
  // Their friends' events, newest first, at most PAGE; `total` counts them all.
  lines: ActivityLine[]
  total: number
}

type SharerSummary = {
  campaignId: string
  sharer: string
  phone: string | null
  session: string | null
  parentPhone: string | null
  parentSession: string | null
  hasParent: boolean
  vias: ShareVia[] | null
  opened: number
  claimed: number
  queued: number
  sent: number
  held: number
}

const SHOWN = ['queued', 'sent', 'held'] as const satisfies readonly PayoutStatus[]

function friendLine(r: Row, c: Campaignish): string {
  const tz = MARKETS[c.country].timezone
  if (r.kind === 'friendOpen') return A.line(S.friendOpen, fdt(r.at, tz))
  if (r.kind === 'friendClaim') {
    const reason = r.status === 'queued' || r.status === 'sent' ? null : reasonText(r.reason)
    return A.line(S.rewardTail(S.friendClaim[c.redeemMethod], localAmount(r.amount ?? 0, c.country), r.status!, reason), fdt(r.at, tz))
  }
  // A friend who got a link of their own: the link's own sharer.
  const friend = who(r.sharerPhone, r.sharerSession)
  return A.line(r.kind === 'share' ? S.childShared(friend, A.via[r.via!]) : S.child(friend), fdt(r.at, tz))
}

// Every sharer of the workspace's campaigns, one row per campaign, newest activity first: what they shared on, how
// many friends opened and claimed, the rewards by status, and (for the row opened) their friends' events.
export async function workspaceSharers(workspaceId: string, opts: { limit?: number } = {}): Promise<{ rows: SharerRow[]; more: boolean }> {
  const limit = Math.min(MAX_SHARERS, Math.max(PAGE, opts.limit ?? PAGE))
  const campaigns = await db.campaign.findMany({
    where: { workspaceId },
    select: { id: true, name: true, country: true, redeemMethod: true },
  })
  if (!campaigns.length) return { rows: [], more: false }
  const byId = new Map(campaigns.map((c) => [c.id, c]))
  const ids = Prisma.join(campaigns.map((c) => c.id))
  const all = Prisma.join(SHARING.map((b) => branchSql(b(ids))), ' UNION ALL ')
  const summaries = await quick<SharerSummary[]>(sql`
    WITH a AS (${all})
    SELECT "campaignId", "sharer",
      max("sharerPhone") AS "phone", max("sharerSession") AS "session",
      max("parentPhone") FILTER (WHERE "kind" IN ('share', 'ownLink')) AS "parentPhone",
      max("parentSession") FILTER (WHERE "kind" IN ('share', 'ownLink')) AS "parentSession",
      bool_or("parent" IS NOT NULL) AS "hasParent",
      array_agg(DISTINCT "via") FILTER (WHERE "kind" = 'share') AS "vias",
      (count(*) FILTER (WHERE "kind" = 'friendOpen'))::int AS "opened",
      (count(*) FILTER (WHERE "kind" = 'friendClaim'))::int AS "claimed",
      (coalesce(sum("amount") FILTER (WHERE "kind" = 'reward' AND "status" = 'queued'), 0))::int AS "queued",
      (coalesce(sum("amount") FILTER (WHERE "kind" = 'reward' AND "status" = 'sent'), 0))::int AS "sent",
      (coalesce(sum("amount") FILTER (WHERE "kind" = 'reward' AND "status" = 'held'), 0))::int AS "held"
    FROM a WHERE "sharer" IS NOT NULL
    GROUP BY "campaignId", "sharer"
    ORDER BY max("at") DESC, "campaignId" DESC, "sharer" DESC
    LIMIT ${limit + 1}`)
  const page = summaries.slice(0, limit)
  const keys = page.map((s) => `${s.campaignId}|${s.sharer}`)
  // Each shown sharer's friends' events, the newest PAGE of them.
  const events = keys.length
    ? await quick<(Row & { owner: string; total: number })[]>(sql`
        WITH a AS (${Prisma.join([links, friendOpens, friendClaims].map((b) => branchSql(b(ids))), ' UNION ALL ')}),
        x AS (
          SELECT a.*, CASE WHEN a."kind" IN ('friendOpen', 'friendClaim') THEN a."sharer" ELSE a."parent" END AS "owner"
          FROM a WHERE a."kind" IN ('friendOpen', 'friendClaim') OR a."parent" IS NOT NULL
        )
        SELECT * FROM (
          SELECT x.*, row_number() OVER (PARTITION BY x."campaignId", x."owner" ORDER BY ${ORDER})::int AS "rn",
                 (count(*) OVER (PARTITION BY x."campaignId", x."owner"))::int AS "total"
          FROM x WHERE x."campaignId" || '|' || x."owner" IN (${Prisma.join(keys)})
        ) y WHERE y."rn" <= ${PAGE} ORDER BY ${ORDER}`)
    : []
  const lines = new Map<string, { lines: ActivityLine[]; total: number }>()
  for (const e of events) {
    const k = `${e.campaignId}|${e.owner}`
    const c = byId.get(e.campaignId)!
    const entry = lines.get(k) ?? { lines: [], total: e.total }
    entry.lines.push({ key: e.key, text: friendLine(e, c), title: e.ids })
    lines.set(k, entry)
  }
  const rows = page.map((s): SharerRow => {
    const c = byId.get(s.campaignId)!
    const k = `${s.campaignId}|${s.sharer}`
    const amounts = SHOWN.filter((st) => s[st] > 0).map((st) => S.amount(localAmount(s[st], c.country), st))
    return {
      key: k,
      campaignId: s.campaignId,
      campaign: c.name,
      who: who(s.phone, s.session),
      friendOf: s.hasParent ? who(s.parentPhone, s.parentSession) : null,
      via: s.vias?.length ? s.vias.map((v) => A.via[v]).join(', ') : null,
      opened: s.opened,
      claimed: s.claimed,
      rewards: amounts.length ? amounts.join(' · ') : null,
      lines: lines.get(k)?.lines ?? [],
      total: lines.get(k)?.total ?? 0,
    }
  })
  return { rows, more: summaries.length > limit }
}
