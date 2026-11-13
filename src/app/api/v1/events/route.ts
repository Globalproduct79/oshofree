import { apiError, json, readJson, withChannel } from '@/lib/api-responses'
import { ingestEvents, parseEvents } from '@/lib/events'

export async function POST(req: Request) {
  return withChannel(req, async (channel) => {
    const batchKey = req.headers.get('idempotency-key')?.trim()
    if (!batchKey) return apiError('missing_idempotency_key', 400)
    const parsed = parseEvents(await readJson(req))
    if ('error' in parsed) return apiError(parsed.error, 400)
    if (parsed.data.channel !== channel.key) return apiError('channel_mismatch', 400)
    const { accepted, deduped, ignored } = await ingestEvents(channel.id, batchKey, parsed.data.events)
    return json({ accepted, deduped, ignored }, 202)
  })
}
