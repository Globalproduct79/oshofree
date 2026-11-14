import { z } from 'zod'
import { apiError, json, readJson, withChannel } from '@/lib/api-responses'
import { claimOffer } from '@/lib/claims'

const claimSchema = z.object({
  offer_id: z.string().min(1).max(200),
  session_id: z.string().min(1).max(200),
})

// Phoenix asks at claim time; asking again the same UTC day returns the same code (200, not 201).
export async function POST(req: Request) {
  return withChannel(req, async (channel) => {
    const parsed = claimSchema.safeParse(await readJson(req))
    if (!parsed.success) return apiError('bad_request', 400)
    const { offer_id, session_id } = parsed.data
    const result = await claimOffer(offer_id, channel.id, session_id)
    if (result === 'unknown_offer') return apiError(result, 404)
    return json({ code: result.code, valid_until: result.validUntil.toISOString() }, result.created ? 201 : 200)
  })
}
