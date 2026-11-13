import { Prisma, type ChannelEventType } from '@prisma/client'
import { z } from 'zod'
import { db } from '@/lib/db'

export const MAX_EVENTS = 500

const TYPES = { impression: 'Impression', open: 'Open', claim: 'Claim', share: 'Share' } as const satisfies Record<
  string,
  ChannelEventType
>

const id = z.string().min(1).max(200)

export const eventSchema = z.object({
  type: z.enum(Object.keys(TYPES) as [keyof typeof TYPES]),
  offer_id: id,
  placement: z.string().max(64).optional(),
  country: z.string().max(64).optional(),
  session_id: id,
  link_code: id.optional(),
  ts: z.iso.datetime({ offset: true }),
})
export type EventInput = z.infer<typeof eventSchema>

export const eventsSchema = z.object({
  channel: z.string(),
  events: z.array(eventSchema).max(MAX_EVENTS),
})

export type EventsBatch = z.infer<typeof eventsSchema>

// The batch, or which 400 it earns: too_many_events beyond MAX_EVENTS, bad_request otherwise.
export function parseEvents(body: unknown): { data: EventsBatch } | { error: 'too_many_events' | 'bad_request' } {
  const parsed = eventsSchema.safeParse(body)
  if (parsed.success) return { data: parsed.data }
  const tooMany = parsed.error.issues.some((i) => i.code === 'too_big' && i.path.length === 1 && i.path[0] === 'events')
  return { error: tooMany ? 'too_many_events' : 'bad_request' }
}

function hourBucket(ts: string): string {
  const d = new Date(ts)
  d.setUTCMinutes(0, 0, 0)
  return d.toISOString()
}

export type IngestResult = { accepted: number; deduped: number; ignored: number; replayed: boolean }

async function storedBatch(channelId: string, key: string): Promise<IngestResult | null> {
  const b = await db.channelBatch.findUnique({ where: { channelId_key: { channelId, key } } })
  return b && { accepted: b.accepted, deduped: b.deduped, ignored: b.ignored, replayed: true }
}

// One event per (session, offer, type, UTC hour) per channel; a repeated batch key replays the stored counts.
export async function ingestEvents(channelId: string, batchKey: string, events: EventInput[]): Promise<IngestResult> {
  const stored = await storedBatch(channelId, batchKey)
  if (stored) return stored
  try {
    return await db.$transaction(async (tx) => {
      const offerIds = [...new Set(events.map((e) => e.offer_id))]
      const known = await tx.campaign.findMany({ where: { id: { in: offerIds } }, select: { id: true } })
      const knownIds = new Set(known.map((c) => c.id))
      const rows = events.filter((e) => knownIds.has(e.offer_id)).map((e) => {
        const type = TYPES[e.type]
        return {
          channelId, campaignId: e.offer_id, type, sessionId: e.session_id, linkCode: e.link_code ?? null,
          at: new Date(e.ts), dedupeKey: `${e.session_id}:${e.offer_id}:${type}:${hourBucket(e.ts)}`,
        }
      })
      const { count: accepted } = await tx.channelEvent.createMany({ data: rows, skipDuplicates: true })
      const counts = { accepted, deduped: rows.length - accepted, ignored: events.length - rows.length }
      await tx.channelBatch.create({ data: { channelId, key: batchKey, ...counts } })
      return { ...counts, replayed: false }
    })
  } catch (e) {
    // A concurrent request stored the same batch key first: its transaction won, ours rolled back.
    const raced = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
    const winner = raced ? await storedBatch(channelId, batchKey) : null
    if (winner) return winner
    throw e
  }
}
