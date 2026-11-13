import type { LinkEventType } from '@prisma/client'
import { db, type Tx } from '@/lib/db'

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

export async function recordClaim(linkId: string, visitorId: string, ipHash: string, userAgent: string): Promise<void> {
  await write('Claim', linkId, visitorId, ipHash, userAgent)
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

export async function linkStats(code: string) {
  const link = await db.shareLink.findUnique({ where: { code }, select: { id: true } })
  if (!link) return null
  const linkId = link.id
  const [opens_unique, opens_all, details_left, claims, children] = await Promise.all([
    db.linkEvent.count({ where: { linkId, type: 'Open', deduped: false } }),
    db.linkEvent.count({ where: { linkId, type: 'Open' } }),
    db.linkEvent.count({ where: { linkId, type: 'DetailsLeft' } }),
    db.linkEvent.count({ where: { linkId, type: 'Claim' } }),
    db.shareLink.count({ where: { parentId: linkId } }),
  ])
  return { opens_unique, opens_all, details_left, claims, children }
}
