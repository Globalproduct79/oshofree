import { ShareVia } from '@prisma/client'
import { z } from 'zod'
import { apiError, json, readJson, withChannel } from '@/lib/api-responses'
import { shareOffer } from '@/lib/offers'

const shareSchema = z.object({
  offer_id: z.string().min(1).max(200),
  session_id: z.string().min(1).max(200),
  via: z.enum(ShareVia),
})

export async function POST(req: Request) {
  return withChannel(req, async (channel) => {
    const parsed = shareSchema.safeParse(await readJson(req))
    if (!parsed.success) return apiError('bad_request', 400)
    const { offer_id, session_id, via } = parsed.data
    const result = await shareOffer(offer_id, channel.id, session_id, via, new Date())
    if (result === 'unknown_offer') return apiError(result, 404)
    if (result === 'not_delivering') return apiError(result, 409)
    return json(result, 201)
  })
}
