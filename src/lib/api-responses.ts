import type { Channel } from '@prisma/client'
import { channelFromRequest } from '@/lib/channels'

// Every channel API response is JSON and never cached.
export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  })
}

export function apiError(error: string, status: number): Response {
  return json({ error }, status)
}

// Runs the handler for the authenticated channel; 401 without a known bearer key.
export async function withChannel(req: Request, handler: (channel: Channel) => Promise<Response>): Promise<Response> {
  const channel = await channelFromRequest(req)
  if (!channel) return json({ error: 'unauthorized' }, 401, { 'www-authenticate': 'Bearer' })
  return handler(channel)
}

// The parsed JSON body, or undefined when it is not JSON.
export function readJson(req: Request): Promise<unknown> {
  return req.json().catch(() => undefined)
}
