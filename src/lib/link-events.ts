import type { LinkEventType } from '@prisma/client'
import { db, type Tx } from '@/lib/db'
import { onSuccessfulShare } from '@/lib/rewards'

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function write(type: LinkEventType, linkId: string, visitorId: string, ipHash: string, userAgent: string, client: Tx = db) {
  return client.linkEvent.create({ data: { linkId, type, visitorId, ipHash, userAgent } })
}

// The raw row is always written; it is marked deduped when this visitor already
// has a counted Open on the link today (UTC). `now` is injectable for tests.
export async function recordOpen(
  linkId: string,
  visitorId: string,
  ipHash: string,
  userAgent: string,
  now: Date = new Date(),
): Promise<{ deduped: boolean }> {
  const dayStart = startOfUtcDay(now)
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
  // Serialise per (link, visitor) so concurrent opens cannot both count as first.
  const deduped = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${linkId} || ':' || ${visitorId}))`
    const counted = await tx.linkEvent.count({
      where: { linkId, visitorId, type: 'Open', deduped: false, at: { gte: dayStart, lt: dayEnd } },
    })
    await tx.linkEvent.create({
      data: { linkId, type: 'Open', visitorId, ipHash, userAgent, deduped: counted > 0, at: now },
    })
    return counted > 0
  })
  return { deduped }
}

// The number this browser left on the landing page, if it ever did: its newest own link carries it.
async function phoneOfVisitor(tx: Tx, visitorId: string): Promise<string | null> {
  const mine = await tx.shareLink.findFirst({
    where: { sharerType: 'Consumer', sharerSessionId: visitorId },
    orderBy: { createdAt: 'desc' },
    select: { consumer: { select: { phone: true } } },
  })
  return mine?.consumer?.phone ?? null
}

// The raw row is always written. A visitor's first Claim on a sharer's link is a successful share
// (spec §6.14.2): its payout is made in the same transaction, keyed by the Claim's id, so a claim and its
// reward stand or fall together. A Root link has no sharer. Serialised per (link, visitor), so concurrent
// claims cannot both count as first.
export async function recordClaim(
  linkId: string,
  visitorId: string,
  ipHash: string,
  userAgent: string,
  now: Date = new Date(),
): Promise<{ first: boolean }> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${linkId} || ':claim:' || ${visitorId}))`
    const earlier = await tx.linkEvent.count({ where: { linkId, visitorId, type: 'Claim' } })
    const event = await tx.linkEvent.create({ data: { linkId, type: 'Claim', visitorId, ipHash, userAgent, at: now } })
    if (earlier) return { first: false }
    const link = await tx.shareLink.findUniqueOrThrow({ where: { id: linkId }, select: { campaignId: true, sharerType: true } })
    if (link.sharerType !== 'Root') {
      await onSuccessfulShare({
        campaignId: link.campaignId, shareLinkId: linkId, claimEventKey: event.id,
        friendVisitorId: visitorId, friendPhone: await phoneOfVisitor(tx, visitorId), now,
      }, tx)
    }
    return { first: true }
  })
}

export async function recordDetails(
  linkId: string,
  visitorId: string,
  ipHash: string,
  userAgent: string,
  client: Tx = db,
): Promise<void> {
  await write('DetailsLeft', linkId, visitorId, ipHash, userAgent, client)
}

// What a link has earned: the landing page's own events, plus the share_open / share_claim events the
// link's channel posted for it as a token (those are the channel's to read and count nowhere else).
export async function linkStats(code: string) {
  const link = await db.shareLink.findUnique({ where: { code }, select: { id: true, channelId: true, campaignId: true } })
  if (!link) return null
  const linkId = link.id
  const reported = (type: 'ShareOpen' | 'ShareClaim') =>
    // campaignId + type is the indexed path into ChannelEvent; the code narrows it to this link.
    db.channelEvent.count({ where: { campaignId: link.campaignId, type, channelId: link.channelId, linkCode: code } })
  const [opens_unique, opens_all, details_left, claims, children, share_opens, share_claims] = await Promise.all([
    db.linkEvent.count({ where: { linkId, type: 'Open', deduped: false } }),
    db.linkEvent.count({ where: { linkId, type: 'Open' } }),
    db.linkEvent.count({ where: { linkId, type: 'DetailsLeft' } }),
    db.linkEvent.count({ where: { linkId, type: 'Claim' } }),
    db.shareLink.count({ where: { parentId: linkId } }),
    reported('ShareOpen'),
    reported('ShareClaim'),
  ])
  return { opens_unique, opens_all, details_left, claims, children, share_opens, share_claims }
}
