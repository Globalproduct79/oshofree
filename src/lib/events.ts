import { Prisma, type CampaignStatus, type ChannelEventType } from '@prisma/client'
import { z } from 'zod'
import { db } from '@/lib/db'

export const MAX_EVENTS = 500

// Wire type → stored type (GLB §2.6 box 2). Any other type is counted as ignored, not refused.
const TYPES = {
  impression: 'Impression',
  open: 'Open',
  claim: 'Claim',
  share: 'Share',
  share_open: 'ShareOpen',
  share_claim: 'ShareClaim',
} as const satisfies Record<string, ChannelEventType>
type WireType = keyof typeof TYPES

const isKnown = (t: string): t is WireType => Object.hasOwn(TYPES, t)
// An offer Phoenix can have been given has gone live: it is live now, or paused or ended since (only a live campaign
// pauses or ends), or Phoenix has already reported on it — a run that went live and was then ended and resubmitted
// (review, rejected) or resumed to a later start (scheduled). A late event from such a run is still counted and billed.
// One that has never gone live is unknown to Phoenix, so an event naming it is ignored, never stored or charged.
const SHOWN: CampaignStatus[] = ['live', 'paused', 'ended']
const HAS_GONE_LIVE = { OR: [{ status: { in: SHOWN } }, { channelEvents: { some: {} } }] } satisfies Prisma.CampaignWhereInput
// A friend's open or claim names the sharer's token, not the offer: the token's link says which offer.
const byToken = (t: string) => t === 'share_open' || t === 'share_claim'

const id = z.string().min(1).max(200)

export const eventSchema = z
  .object({
    type: z.string().min(1).max(64),
    offer_id: id.optional(),
    placement: z.string().max(64).optional(),
    country: z.string().max(64).optional(),
    session_id: id,
    ts: z.iso.datetime({ offset: true }),
    token: id.optional(),
    // Slice 1's name for the token, still accepted.
    link_code: id.optional(),
    claim_code: z.string().max(64).optional(),
    via: z.string().max(64).optional(),
    msisdn_hash: z.string().max(128).optional(),
  })
  .superRefine((e, ctx) => {
    if (byToken(e.type) && !(e.token ?? e.link_code)) ctx.addIssue({ code: 'custom', path: ['token'], message: 'required' })
    else if (isKnown(e.type) && !byToken(e.type) && !e.offer_id)
      ctx.addIssue({ code: 'custom', path: ['offer_id'], message: 'required' })
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
// share_open and share_claim are stored against the token's link (this channel's links only) and feed only
// the channel's own link stats, never advertiser metrics (spec §6.14.2). Unknown types, unknown offers and
// tokens that are not this channel's are ignored; so are events for an offer that has never gone live.
export async function ingestEvents(channelId: string, batchKey: string, events: EventInput[]): Promise<IngestResult> {
  const stored = await storedBatch(channelId, batchKey)
  if (stored) return stored
  try {
    return await db.$transaction(async (tx) => {
      const tokenOf = (e: EventInput) => e.token ?? e.link_code
      const offerIds = [...new Set(events.flatMap((e) => (e.offer_id ? [e.offer_id] : [])))]
      const tokens = [...new Set(events.filter((e) => byToken(e.type)).flatMap((e) => tokenOf(e) ?? []))]
      const [known, links] = await Promise.all([
        tx.campaign.findMany({ where: { id: { in: offerIds }, ...HAS_GONE_LIVE }, select: { id: true } }),
        tx.shareLink.findMany({ where: { code: { in: tokens }, channelId }, select: { code: true, campaignId: true } }),
      ])
      const knownIds = new Set(known.map((c) => c.id))
      const linkCampaign = new Map(links.map((l) => [l.code, l.campaignId]))
      const campaignOf = (e: EventInput): string | null => {
        if (!byToken(e.type)) return e.offer_id && knownIds.has(e.offer_id) ? e.offer_id : null
        const campaignId = linkCampaign.get(tokenOf(e) ?? '')
        return campaignId && (!e.offer_id || e.offer_id === campaignId) ? campaignId : null
      }
      const rows = events.flatMap((e) => {
        const campaignId = isKnown(e.type) ? campaignOf(e) : null
        if (!campaignId) return []
        const type = TYPES[e.type as WireType]
        return [{
          channelId, campaignId, type, sessionId: e.session_id, linkCode: tokenOf(e) ?? null,
          at: new Date(e.ts), dedupeKey: `${e.session_id}:${campaignId}:${type}:${hourBucket(e.ts)}`,
        }]
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
