import { ShareVia } from '@prisma/client'
import { z } from 'zod'
import { apiError, json, readJson, withChannel } from '@/lib/api-responses'
import { shareOffer } from '@/lib/offers'

const shareSchema = z.object({
  offer_id: z.string().min(1).max(200),
  session_id: z.string().min(1).max(200),
  via: z.enum(ShareVia),
  // The sharer's OTP-verified number, E.164; it must be a number of the offer's country.
  msisdn: z.string().max(32).optional(),
})

export async function POST(req: Request) {
  return withChannel(req, async (channel) => {
    const parsed = shareSchema.safeParse(await readJson(req))
    if (!parsed.success) return apiError('bad_request', 400)
    const { offer_id, session_id, via, msisdn } = parsed.data
    const result = await shareOffer(offer_id, channel.id, session_id, via, new Date(), msisdn)
    if (result === 'unknown_offer') return apiError(result, 404)
    if (result === 'not_delivering') return apiError(result, 409)
    if (result === 'bad_msisdn') return apiError('bad_request', 400)
    return json(result, 201)
  })
}
