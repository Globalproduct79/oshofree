import { createHash, randomBytes } from 'node:crypto'
import type { Channel } from '@prisma/client'
import { db } from '@/lib/db'

// Channel keys are stored only as their sha256 hex digest.
export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

const BEARER = /^Bearer\s+(\S+)\s*$/i
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const KEY_PREFIX = 'phx_live_'
const KEY_LENGTH = 24
// How long the key a rotation replaces keeps working, so Phoenix can switch without downtime.
export const PREVIOUS_KEY_GRACE_MS = 24 * 60 * 60 * 1000

// The live channel whose key is in `Authorization: Bearer <key>`, or null; a channel not yet live cannot
// call the API. The key a rotation replaced still answers until its grace period ends.
export async function channelFromRequest(req: Request, now: Date = new Date()): Promise<Channel | null> {
  const key = BEARER.exec(req.headers.get('authorization') ?? '')?.[1]
  if (!key) return null
  const hash = hashKey(key)
  return db.channel.findFirst({
    where: {
      isLive: true,
      OR: [{ apiKeyHash: hash }, { previousKeyHash: hash, previousKeyValidUntil: { gt: now } }],
    },
  })
}

// 24 base62 characters, each drawn without modulo bias.
function randomKeyBody(): string {
  let out = ''
  while (out.length < KEY_LENGTH) {
    for (const b of randomBytes(KEY_LENGTH)) {
      if (b < 248 && out.length < KEY_LENGTH) out += BASE62[b % 62]
    }
  }
  return out
}

// A fresh channel key in plain text: `phx_live_` and 24 base62 characters. Only its hash is ever stored.
export const newChannelKey = (): string => KEY_PREFIX + randomKeyBody()

// A new key for the channel, returned in plain text this once and stored only as its hash. The key it
// replaces keeps working for 24 hours (a second rotation inside that window retires it at once).
export async function rotateKey(channelId: string, byUserId: string, now: Date = new Date()): Promise<string> {
  const key = newChannelKey()
  const validUntil = new Date(now.getTime() + PREVIOUS_KEY_GRACE_MS)
  await db.$transaction(async (tx) => {
    // Two rotations at once must not both demote the same key: the second waits and demotes the first's.
    await tx.$executeRaw`SELECT 1 FROM "Channel" WHERE "id" = ${channelId} FOR UPDATE`
    const before = await tx.channel.findUniqueOrThrow({ where: { id: channelId } })
    await tx.channel.update({
      where: { id: channelId },
      data: { apiKeyHash: hashKey(key), previousKeyHash: before.apiKeyHash, previousKeyValidUntil: validUntil, keyCreatedAt: now },
    })
    // Written here rather than through audit() so the rotation and its record commit together. Never the key.
    await tx.auditEvent.create({
      data: {
        actorId: byUserId, action: 'channel.key.rotate', targetType: 'Channel', targetId: channelId,
        before: { keyCreatedAt: before.keyCreatedAt.toISOString() },
        after: { keyCreatedAt: now.toISOString(), previousKeyValidUntil: validUntil.toISOString() },
      },
    })
  })
  return key
}
