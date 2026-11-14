import { randomBytes } from 'node:crypto'
import { Prisma, type ShareLink, type ShareVia } from '@prisma/client'
import { db, isUniqueViolation, type Tx } from '@/lib/db'

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

// 5 random bytes = 40 bits = 8 symbols of 5 bits.
export function generateCode(): string {
  const n = randomBytes(5).readUIntBE(0, 5)
  let out = ''
  for (let i = 7; i >= 0; i--) out += ALPHABET[Math.floor(n / 2 ** (5 * i)) % 32]
  return out
}

// The seed of a campaign's share tree: one Root link per (campaign, channel).
export async function mintRootLink(campaignId: string, channelId: string, client: Tx = db): Promise<ShareLink> {
  const existing = await client.shareLink.findFirst({ where: { campaignId, channelId, sharerType: 'Root' } })
  if (existing) return existing
  for (let attempt = 0; ; attempt++) {
    // Inside a transaction a unique violation aborts it, so look before inserting.
    const code = generateCode()
    if (await client.shareLink.findUnique({ where: { code }, select: { id: true } })) continue
    try {
      return await client.shareLink.create({
        data: { code, campaignId, channelId, depth: 0, sharerType: 'Root' },
      })
    } catch (e) {
      const collision = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
      if (!collision || attempt >= 4) throw e
    }
  }
}

export function linkUrl(code: string): string {
  return `${process.env.APP_URL}/o/${code}`
}

async function createLink(data: Omit<Prisma.ShareLinkUncheckedCreateInput, 'code'>, client: Tx = db): Promise<ShareLink> {
  for (let attempt = 0; ; attempt++) {
    // Inside a transaction a unique violation aborts it, so look before inserting.
    const code = generateCode()
    if (await client.shareLink.findUnique({ where: { code }, select: { id: true } })) continue
    try {
      return await client.shareLink.create({ data: { ...data, code } })
    } catch (e) {
      if (!isUniqueViolation(e) || attempt >= 4) throw e
    }
  }
}

// A sharer's own link, one level under the Root for the (campaign, channel). Each share mints a new one,
// except for a sharer whose number Phoenix sent: they hold one link per (campaign, channel), and asking
// again hands it back (the (parent, consumer) pair is unique, as for a landing-page sharer).
export async function mintChannelLink(
  campaignId: string,
  channelId: string,
  sessionId: string,
  via: ShareVia,
  consumerId?: string,
): Promise<ShareLink> {
  const root = await mintRootLink(campaignId, channelId)
  const data = {
    campaignId, channelId, parentId: root.id, depth: root.depth + 1,
    sharerType: 'Channel' as const, sharerSessionId: sessionId, via,
  }
  if (!consumerId) return createLink(data)
  const held = () => db.shareLink.findFirst({ where: { parentId: root.id, consumerId }, orderBy: { createdAt: 'asc' } })
  try {
    return await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${root.id} || ':consumer:' || ${consumerId}))`
      const existing = await tx.shareLink.findFirst({ where: { parentId: root.id, consumerId }, orderBy: { createdAt: 'asc' } })
      return existing ?? createLink({ ...data, consumerId }, tx)
    })
  } catch (e) {
    // The unique index is the backstop: whoever won the race holds the link.
    const existing = isUniqueViolation(e) ? await held() : null
    if (existing) return existing
    throw e
  }
}

// A consumer's link, one level under whichever link brought them in: one per (parent, consumer),
// so asking again returns the link they already hold. In a transaction, a per-pair advisory lock
// makes a concurrent second ask wait and then find the first; the unique index is the backstop.
// `visitorId` is the og_v cookie of the browser that asked: stored as the link's sharerSessionId, it is
// how a claim from the sharer's own browser is recognised (spec §6.14.2).
export async function ensureConsumerLink(
  parentId: string,
  consumerId: string,
  client: Tx = db,
  visitorId?: string,
): Promise<{ link: ShareLink; created: boolean }> {
  await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${parentId} || ':consumer:' || ${consumerId}))`
  const existing = await client.shareLink.findFirst({ where: { parentId, consumerId }, orderBy: { createdAt: 'asc' } })
  if (existing) return { link: existing, created: false }
  const parent = await client.shareLink.findUniqueOrThrow({ where: { id: parentId } })
  const link = await createLink({
    campaignId: parent.campaignId, channelId: parent.channelId, parentId: parent.id,
    depth: parent.depth + 1, sharerType: 'Consumer', consumerId, sharerSessionId: visitorId ?? null, via: null,
  }, client)
  return { link, created: true }
}

export async function mintConsumerLink(parentId: string, consumerId: string, client: Tx = db, visitorId?: string): Promise<ShareLink> {
  try {
    return (await ensureConsumerLink(parentId, consumerId, client, visitorId)).link
  } catch (e) {
    // Outside a transaction a concurrent mint can win the race; theirs is the link.
    if (!isUniqueViolation(e)) throw e
    return client.shareLink.findFirstOrThrow({ where: { parentId, consumerId }, orderBy: { createdAt: 'asc' } })
  }
}

export async function setLinkVia(id: string, via: ShareVia): Promise<void> {
  await db.shareLink.update({ where: { id }, data: { via } })
}

export function linkByCode(code: string) {
  return db.shareLink.findUnique({ where: { code }, include: { campaign: { include: { workspace: true } } } })
}
