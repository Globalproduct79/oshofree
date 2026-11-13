import { randomBytes } from 'node:crypto'
import { Prisma, type ShareLink } from '@prisma/client'
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
export async function mintRootLink(campaignId: string, channelId: string): Promise<ShareLink> {
  const existing = await db.shareLink.findFirst({ where: { campaignId, channelId, sharerType: 'Root' } })
  if (existing) return existing
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.shareLink.create({
        data: { code: generateCode(), campaignId, channelId, depth: 0, sharerType: 'Root' },
      })
    } catch (e) {
      const collision = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
      if (!collision || attempt >= 4) throw e
    }
  }
}
