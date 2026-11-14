import { randomBytes } from 'node:crypto'
import { deliveringWhere } from '@/lib/campaign-status'
import { db, isUniqueViolation } from '@/lib/db'
import { startOfUtcDay } from '@/lib/link-events'

// Claim codes (GLB §2.6 "Claim codes"): PHX- and four characters, none of them 0/O or 1/I.
// One per session per offer per channel per UTC day; valid until the campaign ends. A code is unique
// within its campaign only (the brand honours its own offer's codes), so the 32^4 space is per campaign.
export const CLAIM_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const ATTEMPTS = 8

// 32 symbols: the low 5 bits of each random byte are uniform.
export function randomClaimCode(): string {
  return 'PHX-' + [...randomBytes(4)].map((b) => CLAIM_ALPHABET[b & 31]).join('')
}

export type IssuedClaimCode = { code: string; validUntil: Date; created: boolean }

const KEY = (campaignId: string, channelId: string, sessionId: string, day: Date) => ({
  campaignId_channelId_sessionId_day: { campaignId, channelId, sessionId, day },
})

// The session's code for the offer today, issuing one when it has none. A concurrent ask for the same
// session loses the unique race and reads the winner's; a code this campaign already issued is drawn again.
export async function issueClaimCode(
  campaignId: string,
  channelId: string,
  sessionId: string,
  now: Date = new Date(),
  draw: () => string = randomClaimCode,
): Promise<IssuedClaimCode> {
  const day = startOfUtcDay(now)
  const existing = await db.claimCode.findUnique({ where: KEY(campaignId, channelId, sessionId, day) })
  if (existing) return { code: existing.code, validUntil: existing.validUntil, created: false }
  const { endsAt } = await db.campaign.findUniqueOrThrow({ where: { id: campaignId }, select: { endsAt: true } })
  for (let attempt = 1; ; attempt++) {
    try {
      const row = await db.claimCode.create({
        data: { code: draw(), campaignId, channelId, sessionId, day, validUntil: endsAt },
      })
      return { code: row.code, validUntil: row.validUntil, created: true }
    } catch (e) {
      // Either (campaign, channel, session, day) or (campaign, code) collided; the first means we lost a race.
      if (!isUniqueViolation(e)) throw e
      const won = await db.claimCode.findUnique({ where: KEY(campaignId, channelId, sessionId, day) })
      if (won) return { code: won.code, validUntil: won.validUntil, created: false }
      if (attempt >= ATTEMPTS) throw e
    }
  }
}

// POST /claims: a code for an offer that is delivering now, or unknown_offer.
export async function claimOffer(
  offerId: string,
  channelId: string,
  sessionId: string,
  now: Date = new Date(),
): Promise<IssuedClaimCode | 'unknown_offer'> {
  const delivering = await db.campaign.findFirst({ where: { id: offerId, ...deliveringWhere(now) }, select: { id: true } })
  if (!delivering) return 'unknown_offer'
  return issueClaimCode(offerId, channelId, sessionId, now)
}
