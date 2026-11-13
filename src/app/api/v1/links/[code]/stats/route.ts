import { apiError, json, withChannel } from '@/lib/api-responses'
import { linkStats } from '@/lib/link-events'

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  return withChannel(req, async () => {
    const stats = await linkStats((await params).code)
    return stats ? json(stats) : apiError('unknown_link', 404)
  })
}
