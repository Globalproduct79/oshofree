import { apiError, json, withChannel } from '@/lib/api-responses'
import { isCountry } from '@/lib/markets'
import { offersFor } from '@/lib/offers'

// ?channel= is optional (the key names the channel); when sent it must be the key's own.
export async function GET(req: Request) {
  return withChannel(req, async (channel) => {
    const params = new URL(req.url).searchParams
    const country = params.get('country')
    if (!isCountry(country)) return apiError('bad_country', 400)
    const named = params.get('channel')
    if (named !== null && named !== channel.key) return apiError('channel_mismatch', 400)
    const now = new Date()
    const offers = await offersFor(country, channel.id, now)
    return json({ country, generated_at: now.toISOString(), ttl_seconds: 900, offers })
  })
}
