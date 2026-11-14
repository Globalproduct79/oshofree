import { Prisma, type Campaign, type PayoutStatus, type RedeemMethod, type ShareVia } from '@prisma/client'
import { ACTIVITY as A, SHARERS as S } from '@/lib/copy-activity'
import { db } from '@/lib/db'
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

export const PAGE = 30
// The most lines one page asks for; "Show more" grows by PAGE up to it.
export const MAX_LINES = 3000

export type Kind =
  | 'impressions' | 'open' | 'claim' | 'follow' | 'pageOpen' | 'share' | 'ownLink' | 'friendOpen' | 'friendClaim' | 'reward' | 'points'

export type ActivityLine = { key: string; text: string; title: string }

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

function impressions(ids: Ids): Prisma.Sql {
  const hour = raw(`date_trunc('hour', e."at")`)
  return sql`SELECT ${select({
    kind: sql`'impressions'`, at: sql`max(e."at")`, rank: sql`0`,
    key: sql`'imp-' || e."channelId" || '-' || to_char(${hour}, 'YYYYMMDDHH24')`,
    // The hour as ingestion writes it at the end of the events' dedupe keys.
    ids: sql`'Impression:' || to_char(${hour}, 'YYYY-MM-DD"T"HH24":00:00.000Z"')`,
    campaignId: sql`e."campaignId"`, channelId: sql`e."channelId"`, n: sql`count(*)`, hour,
  })}
  FROM "ChannelEvent" e WHERE e."campaignId" IN (${ids}) AND e."type" = 'Impression'
  GROUP BY e."campaignId", e."channelId", ${hour}`
}

function channelEvents(ids: Ids): Prisma.Sql {
  return sql`SELECT ${select({
    kind: sql`CASE e."type" WHEN 'Open' THEN 'open' ELSE 'claim' END`, at: sql`e."at"`,
    rank: sql`CASE e."type" WHEN 'Open' THEN 1 ELSE 2 END`, key: sql`lower(e."type"::text) || '-' || e."id"`,
    ids: sql`concat_ws(' · ', e."id", cc."id")`, campaignId: sql`e."campaignId"`, channelId: sql`e."channelId"`,
  })}
  FROM "ChannelEvent" e ${codeOf('e', 'e."campaignId"', 'e."channelId"', 'e."sessionId"')}
  WHERE e."campaignId" IN (${ids}) AND e."type" IN ('Open', 'Claim')`
}

// Codes with no claim event that day and no offer-page claim by that visitor: the code is the only record.
function codes(ids: Ids): Prisma.Sql {
  return sql`SELECT ${select({
    kind: sql`'claim'`, at: sql`cc."createdAt"`, rank: sql`2`, key: sql`'code-' || cc."id"`, ids: sql`cc."id"`,
    campaignId: sql`cc."campaignId"`, channelId: sql`cc."channelId"`,
  })}
  FROM "ClaimCode" cc
  WHERE cc."campaignId" IN (${ids})
    AND NOT EXISTS (SELECT 1 FROM "ChannelEvent" e WHERE e."campaignId" = cc."campaignId" AND e."type" = 'Claim'
      AND e."channelId" = cc."channelId" AND e."sessionId" = cc."sessionId" AND date_trunc('day', e."at") = cc."day")
    AND NOT EXISTS (SELECT 1 FROM "LinkEvent" v JOIN "ShareLink" vl ON vl."id" = v."linkId"
      WHERE vl."campaignId" = cc."campaignId" AND v."type" = 'Claim' AND v."visitorId" = cc."sessionId")`
}

// The campaign's own link: Phoenix's click-through (or a code taken on its page) and opens of its page.
function rootEvents(ids: Ids): Prisma.Sql {
  return sql`SELECT ${select({
    kind: sql`CASE e."type" WHEN 'Claim' THEN 'follow' ELSE 'pageOpen' END`, at: sql`e."at"`,
    rank: sql`CASE e."type" WHEN 'Claim' THEN 2 ELSE 1 END`, key: sql`'root-' || e."id"`,
    ids: sql`concat_ws(' · ', e."id", cc."id")`, campaignId: sql`l."campaignId"`, channelId: sql`l."channelId"`,
  })}
  FROM "LinkEvent" e JOIN "ShareLink" l ON l."id" = e."linkId"
  ${codeOf('e', 'l."campaignId"', 'l."channelId"', 'e."visitorId"')}
  WHERE l."campaignId" IN (${ids}) AND l."depth" = 0 AND (e."type" = 'Claim' OR (e."type" = 'Open' AND e."deduped" = false))`
}

// Sharers' links: one that went out on a medium is a share; a friend's own link not shared on yet is still a line.
function links(ids: Ids): Prisma.Sql {
  return sql`SELECT ${select({
    kind: sql`CASE WHEN l."via" IS NULL THEN 'ownLink' ELSE 'share' END`,
    at: sql`LEAST(l."createdAt", se."at", dt."at")`, rank: sql`3`, key: sql`'link-' || l."id"`,
    ids: sql`concat_ws(' · ', l."id", se."id", dt."id")`, campaignId: sql`l."campaignId"`, channelId: sql`l."channelId"`,
    via: sql`l."via"`, sharer: linkSharer('l'), sharerPhone: sql`c."phone"`, sharerSession: linkSession('l'),
    parent: sql`CASE WHEN pa."sharerType" = 'Root' THEN NULL ELSE ${linkSharer('pa')} END`, parentPhone: sql`pc."phone"`,
    parentSession: sql`CASE WHEN pa."sharerType" = 'Root' THEN NULL ELSE ${linkSession('pa')} END`,
  })}
  FROM "ShareLink" l
  LEFT JOIN "ShareLink" pa ON pa."id" = l."parentId"
  LEFT JOIN "Consumer" c ON c."id" = l."consumerId"
  LEFT JOIN "Consumer" pc ON pc."id" = pa."consumerId"
  LEFT JOIN (
    SELECT DISTINCT ON ("campaignId", "channelId", "linkCode") "campaignId", "channelId", "linkCode", "at", "id"
    FROM "ChannelEvent" WHERE "campaignId" IN (${ids}) AND "type" = 'Share' AND "linkCode" IS NOT NULL
    ORDER BY "campaignId", "channelId", "linkCode", "at", "id"
  ) se ON se."campaignId" = l."campaignId" AND se."channelId" = l."channelId" AND se."linkCode" = l."code"
  LEFT JOIN (
    SELECT DISTINCT ON (d."linkId", d."visitorId") d."linkId", d."visitorId", d."at", d."id"
    FROM "LinkEvent" d JOIN "ShareLink" dl ON dl."id" = d."linkId"
    WHERE dl."campaignId" IN (${ids}) AND d."type" = 'DetailsLeft'
    ORDER BY d."linkId", d."visitorId", d."at", d."id"
  ) dt ON l."sharerType" = 'Consumer' AND dt."linkId" = l."parentId" AND dt."visitorId" = l."sharerSessionId"
  WHERE l."campaignId" IN (${ids}) AND l."sharerType" <> 'Root' AND (l."via" IS NOT NULL OR l."sharerType" = 'Consumer')`
}

function friendOpens(ids: Ids): Prisma.Sql {
  return sql`SELECT ${select({
    kind: sql`'friendOpen'`, at: sql`e."at"`, rank: sql`4`, key: sql`'fo-' || e."id"`, ids: sql`e."id"`,
    campaignId: sql`l."campaignId"`, channelId: sql`l."channelId"`,
    sharer: linkSharer('l'), sharerPhone: sql`c."phone"`, sharerSession: linkSession('l'),
  })}
  FROM "LinkEvent" e JOIN "ShareLink" l ON l."id" = e."linkId" LEFT JOIN "Consumer" c ON c."id" = l."consumerId"
  WHERE l."campaignId" IN (${ids}) AND l."depth" >= 1 AND e."type" = 'Open' AND e."deduped" = false`
}

// A friend's first claim on a sharer's link is the one a payout is keyed by; a repeat claim earns nothing and is no line.
function friendClaims(ids: Ids): Prisma.Sql {
  return sql`SELECT ${select({
    kind: sql`'friendClaim'`, at: sql`e."at"`, rank: sql`5`, key: sql`'fc-' || e."id"`,
    ids: sql`concat_ws(' · ', e."id", p."id", cc."id")`, campaignId: sql`l."campaignId"`, channelId: sql`l."channelId"`,
    sharer: linkSharer('l'), sharerPhone: sql`c."phone"`, sharerSession: linkSession('l'),
    status: sql`p."status"`, reason: sql`p."reason"`, amount: sql`p."amountLocal"`,
  })}
  FROM "LinkEvent" e JOIN "ShareLink" l ON l."id" = e."linkId" JOIN "RewardPayout" p ON p."claimEventKey" = e."id"
  LEFT JOIN "Consumer" c ON c."id" = l."consumerId"
  ${codeOf('e', 'l."campaignId"', 'l."channelId"', 'e."visitorId"')}
  WHERE l."campaignId" IN (${ids}) AND l."depth" >= 1 AND e."type" = 'Claim'`
}

function rewards(ids: Ids): Prisma.Sql {
  return sql`SELECT ${select({
    kind: sql`'reward'`, at: sql`p."createdAt"`, rank: sql`6`, key: sql`'reward-' || p."id"`, ids: sql`p."id"`,
    campaignId: sql`p."campaignId"`,
    sharer: sql`CASE WHEN p."sharerConsumerId" IS NOT NULL THEN 'c:' || p."sharerConsumerId" ELSE 's:' || COALESCE(p."sharerSessionId", p."shareLinkId") END`,
    sharerPhone: sql`c."phone"`, sharerSession: sql`COALESCE(p."sharerSessionId", p."shareLinkId")`,
    status: sql`p."status"`, reason: sql`p."reason"`, amount: sql`p."amountLocal"`,
  })}
  FROM "RewardPayout" p LEFT JOIN "Consumer" c ON c."id" = p."sharerConsumerId"
  WHERE p."campaignId" IN (${ids})`
}

function points(ids: Ids): Prisma.Sql {
  return sql`SELECT ${select({
    kind: sql`'points'`, at: sql`pl."createdAt"`, rank: sql`7`, key: sql`'points-' || pl."id"`, ids: sql`pl."id"`,
    campaignId: sql`pl."campaignId"`, sharerPhone: sql`c."phone"`, sharerSession: sql`pl."sharerSessionId"`, points: sql`pl."points"`,
  })}
  FROM "PointsLedger" pl LEFT JOIN "Consumer" c ON c."id" = pl."consumerId"
  WHERE pl."campaignId" IN (${ids})`
}

const BRANCHES = { impressions, channelEvents, codes, rootEvents, links, friendOpens, friendClaims, rewards, points }
type Branch = keyof typeof BRANCHES
const EVERY = Object.keys(BRANCHES) as Branch[]
const SHARING: Branch[] = ['links', 'friendOpens', 'friendClaims', 'rewards']

function union(campaignIds: string[], branches: Branch[]): Prisma.Sql {
  const ids = Prisma.join(campaignIds)
  return Prisma.join(branches.map((b) => BRANCHES[b](ids)), ' UNION ALL ')
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
      return A.impressions(r.n ?? 0, channel)
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

// "Show more" asks for one more page each time: a whole number of pages, at least one, at most MAX_LINES.
export function linesWanted(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value)
  if (!Number.isFinite(n) || n < PAGE) return PAGE
  return Math.min(MAX_LINES, Math.ceil(n / PAGE) * PAGE)
}

// A line's element id, for a link to it (keys are ids and kinds; points keys carry a colon).
export const lineAnchor = (key: string) => `act-${key.replace(/[^\w-]/g, '-')}`

export type CampaignActivity = {
  lines: ActivityLine[]
  // There is an older line than the last one shown.
  more: boolean
  // How many lines were asked for (the next "Show more" asks for PAGE more).
  limit: number
  // The line a link asked for, when the campaign has it; the page grew to include it.
  line: string | null
}

// The campaign's last `limit` lines, newest first. With `line` (a link from Global's held rewards), enough pages to
// reach that line, which is returned as found. More than MAX_LINES are never read at once.
export async function campaignActivity(
  c: Pick<Campaign, 'id'> & Campaignish,
  opts: { limit?: number; line?: string | null } = {},
): Promise<CampaignActivity> {
  const all = union([c.id], EVERY)
  let limit = Math.min(MAX_LINES, Math.max(PAGE, opts.limit ?? PAGE))
  let line: string | null = null
  if (opts.line) {
    const [pos] = await db.$queryRaw<{ before: number; found: number }[]>`
      WITH a AS (${all}), t AS (SELECT "at", "rank", "key" FROM a WHERE "key" = ${opts.line})
      SELECT (SELECT count(*) FROM a, t WHERE (a."at", a."rank", a."key") > (t."at", t."rank", t."key"))::int AS "before",
             (SELECT count(*) FROM t)::int AS "found"`
    const need = Math.ceil((pos.before + 1) / PAGE) * PAGE
    // A line further back than a page may show is not looked for.
    if (pos.found && need <= MAX_LINES) {
      line = opts.line
      limit = Math.max(limit, need)
    }
  }
  const [rows, channel] = await Promise.all([
    db.$queryRaw<Row[]>`WITH a AS (${all}) SELECT * FROM a ORDER BY ${ORDER} LIMIT ${limit + 1}`,
    channelNames(),
  ])
  return { lines: rows.slice(0, limit).map((r) => lineOf(r, c, channel(r.channelId))), more: rows.length > limit, limit, line }
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
  const limit = Math.min(MAX_LINES, Math.max(PAGE, opts.limit ?? PAGE))
  const campaigns = await db.campaign.findMany({
    where: { workspaceId },
    select: { id: true, name: true, country: true, redeemMethod: true },
  })
  if (!campaigns.length) return { rows: [], more: false }
  const byId = new Map(campaigns.map((c) => [c.id, c]))
  const all = union(campaigns.map((c) => c.id), SHARING)
  const summaries = await db.$queryRaw<SharerSummary[]>`
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
    LIMIT ${limit + 1}`
  const page = summaries.slice(0, limit)
  const keys = page.map((s) => `${s.campaignId}|${s.sharer}`)
  // Each shown sharer's friends' events, the newest PAGE of them.
  const events = keys.length
    ? await db.$queryRaw<(Row & { owner: string; total: number })[]>`
        WITH a AS (${union(campaigns.map((c) => c.id), ['links', 'friendOpens', 'friendClaims'])}),
        x AS (
          SELECT a.*, CASE WHEN a."kind" IN ('friendOpen', 'friendClaim') THEN a."sharer" ELSE a."parent" END AS "owner"
          FROM a WHERE a."kind" IN ('friendOpen', 'friendClaim') OR a."parent" IS NOT NULL
        )
        SELECT * FROM (
          SELECT x.*, row_number() OVER (PARTITION BY x."campaignId", x."owner" ORDER BY ${ORDER})::int AS "rn",
                 (count(*) OVER (PARTITION BY x."campaignId", x."owner"))::int AS "total"
          FROM x WHERE x."campaignId" || '|' || x."owner" IN (${Prisma.join(keys)})
        ) y WHERE y."rn" <= ${PAGE} ORDER BY ${ORDER}`
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
