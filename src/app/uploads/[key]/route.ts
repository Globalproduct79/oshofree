import { openImage } from '@/lib/storage'

const HEADERS = {
  'Accept-Ranges': 'bytes',
  'Cache-Control': 'public, max-age=31536000, immutable',
  'X-Content-Type-Options': 'nosniff',
}

// One "bytes=a-b", "bytes=a-" or "bytes=-n" range; anything else is served whole.
function parseRange(header: string | null, size: number) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header ?? '')
  if (!m || (!m[1] && !m[2])) return null
  let start = m[1] ? Number(m[1]) : size - Number(m[2])
  let end = m[1] && m[2] ? Number(m[2]) : size - 1
  start = Math.max(start, 0)
  end = Math.min(end, size - 1)
  return start <= end && start < size ? { start, end } : 'unsatisfiable'
}

// Public on purpose: the consumer landing page and the Phoenix wall load images without a session.
// Video needs Range so a browser can seek and Safari will play it; partial content is served (206). The file is opened
// once, and its size and bytes come from that open file: one deleted meanwhile is served whole or 404, never a 500.
async function serve(req: Request, key: string, body: boolean) {
  const file = await openImage(key)
  if (!file) return new Response('Not found', { status: 404 })
  const range = parseRange(req.headers.get('range'), file.size)
  if (range === 'unsatisfiable' || !body) await file.close()
  if (range === 'unsatisfiable') {
    return new Response(null, { status: 416, headers: { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes */${file.size}` } })
  }
  const headers = { ...HEADERS, 'Content-Type': file.contentType }
  if (!range) {
    return new Response(body ? file.read() : null, { headers: { ...headers, 'Content-Length': String(file.size) } })
  }
  return new Response(body ? file.read(range) : null, {
    status: 206,
    headers: {
      ...headers,
      'Content-Length': String(range.end - range.start + 1),
      'Content-Range': `bytes ${range.start}-${range.end}/${file.size}`,
    },
  })
}

type Ctx = { params: Promise<{ key: string }> }
export async function GET(req: Request, { params }: Ctx) {
  return serve(req, (await params).key, true)
}
// The headers alone: the file is opened for its size and closed at once.
export async function HEAD(req: Request, { params }: Ctx) {
  return serve(req, (await params).key, false)
}
