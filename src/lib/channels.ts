import { createHash } from 'node:crypto'
import type { Channel } from '@prisma/client'
import { db } from '@/lib/db'

// Channel keys are stored only as their sha256 hex digest.
export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

const BEARER = /^Bearer\s+(\S+)\s*$/i

// The live channel whose key is in `Authorization: Bearer <key>`, or null; a channel not yet live cannot call the API.
export async function channelFromRequest(req: Request): Promise<Channel | null> {
  const key = BEARER.exec(req.headers.get('authorization') ?? '')?.[1]
  if (!key) return null
  return db.channel.findFirst({ where: { apiKeyHash: hashKey(key), isLive: true } })
}
