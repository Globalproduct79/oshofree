import type { LinkEventType } from '@prisma/client'
import { db } from '@/lib/db'

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function write(type: LinkEventType, linkId: string, visitorId: string, ipHash: string, userAgent: string, deduped = false, at = new Date()) {
  return db.linkEvent.create({ data: { linkId, type, visitorId, ipHash, userAgent, deduped, at } })
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
  const counted = await db.linkEvent.count({
    where: { linkId, visitorId, type: 'Open', deduped: false, at: { gte: startOfUtcDay(now) } },
  })
  const deduped = counted > 0
  await write('Open', linkId, visitorId, ipHash, userAgent, deduped, now)
  return { deduped }
}

export async function recordClaim(linkId: string, visitorId: string, ipHash: string, userAgent: string): Promise<void> {
  await write('Claim', linkId, visitorId, ipHash, userAgent)
}

export async function recordDetails(linkId: string, visitorId: string, ipHash: string, userAgent: string): Promise<void> {
  await write('DetailsLeft', linkId, visitorId, ipHash, userAgent)
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
