import { apiError, json, withChannel } from '@/lib/api-responses'
import { db } from '@/lib/db'
import { linkStats } from '@/lib/link-events'

// A channel sees only its own links' stats; another channel's code is as unknown as a made-up one.
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  return withChannel(req, async (channel) => {
    const { code } = await params
    const link = await db.shareLink.findUnique({ where: { code }, select: { channelId: true } })
    const stats = link?.channelId === channel.id ? await linkStats(code) : null
    return stats ? json(stats) : apiError('unknown_link', 404)
  })
}
