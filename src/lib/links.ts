import { randomBytes } from 'node:crypto'
import { Prisma, type ShareLink, type ShareVia } from '@prisma/client'
import type { Tx } from '@/lib/db'
import { db } from '@/lib/db'

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

async function createLink(data: Omit<Prisma.ShareLinkUncheckedCreateInput, 'code'>): Promise<ShareLink> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.shareLink.create({ data: { ...data, code: generateCode() } })
    } catch (e) {
      const collision = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
      if (!collision || attempt >= 4) throw e
    }
  }
}

// A sharer's own link, one level under the Root for the (campaign, channel).
export async function mintChannelLink(
  campaignId: string,
  channelId: string,
  sessionId: string,
  via: ShareVia,
): Promise<ShareLink> {
  const root = await mintRootLink(campaignId, channelId)
  return createLink({
    campaignId, channelId, parentId: root.id, depth: root.depth + 1,
    sharerType: 'Channel', sharerSessionId: sessionId, via,
  })
}

// A consumer's link, one level under whichever link brought them in.
export async function mintConsumerLink(parentId: string, consumerId: string): Promise<ShareLink> {
  const parent = await db.shareLink.findUniqueOrThrow({ where: { id: parentId } })
  return createLink({
    campaignId: parent.campaignId, channelId: parent.channelId, parentId: parent.id,
    depth: parent.depth + 1, sharerType: 'Consumer', consumerId, via: null,
  })
}

export async function setLinkVia(id: string, via: ShareVia): Promise<void> {
  await db.shareLink.update({ where: { id }, data: { via } })
}

export function linkByCode(code: string) {
  return db.shareLink.findUnique({ where: { code }, include: { campaign: { include: { workspace: true } } } })
}
