import type { Country } from '@prisma/client'
import { apiError, json, withChannel } from '@/lib/api-responses'
import { COUNTRIES } from '@/lib/markets'
import { offersFor } from '@/lib/offers'

const isCountry = (c: string | null): c is Country => (COUNTRIES as readonly (string | null)[]).includes(c)

export async function GET(req: Request) {
  return withChannel(req, async (channel) => {
    const country = new URL(req.url).searchParams.get('country')
    if (!isCountry(country)) return apiError('bad_country', 400)
    const now = new Date()
    const offers = await offersFor(country, channel.id, now)
    return json({ country, generated_at: now.toISOString(), ttl_seconds: 900, offers })
  })
}
