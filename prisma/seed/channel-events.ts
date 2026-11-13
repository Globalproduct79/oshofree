import type { ChannelEventType } from '@prisma/client'
import { db } from '@/lib/db'
import { between, prng } from './prng'

const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000

// 14 days ending today, deterministic: the same campaign and clock day give the same rows.
export async function seedChannelEvents(campaignId: string, channelId: string, now: Date) {
  const rng = prng(20261113)
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const rows: { channelId: string; campaignId: string; type: ChannelEventType; sessionId: string; at: Date; dedupeKey: string }[] = []
  const batches: { channelId: string; key: string; accepted: number; deduped: number; ignored: number; receivedAt: Date }[] = []
  for (let day = 0; day < 14; day++) {
    const dayStart = today - (13 - day) * DAY
    const span = Math.max(HOUR, Math.min(DAY, now.getTime() - dayStart))
    const impressions = between(rng, 80, 140)
    const plan: [ChannelEventType, number][] = [
      ['Impression', impressions],
      ['Open', Math.round(impressions * (0.03 + rng() * 0.02))],
      ['Claim', between(rng, 1, 3)],
      ['Share', between(rng, 2, 4)],
    ]
    let n = 0
    for (const [type, count] of plan) {
      for (let i = 0; i < count; i++, n++) {
        const at = new Date(dayStart + Math.floor(rng() * span))
        const hourIso = new Date(Math.floor(at.getTime() / HOUR) * HOUR).toISOString()
        const sessionId = `seed-s-${day}-${n}`
        rows.push({ channelId, campaignId, type, sessionId, at, dedupeKey: `${sessionId}:${campaignId}:${type}:${hourIso}` })
      }
    }
    batches.push({ channelId, key: `seed-batch-${day}`, accepted: n, deduped: 0, ignored: 0,
      receivedAt: new Date(Math.min(now.getTime(), dayStart + DAY - 1)) })
  }
  await db.channelEvent.createMany({ data: rows })
  await db.channelBatch.createMany({ data: batches })
  return { events: rows.length, batches: batches.length }
}
