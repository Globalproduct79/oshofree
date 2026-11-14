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
// Video needs Range so a browser can seek and Safari will play it; partial content is served (206).
export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const key = (await params).key
  const whole = await openImage(key)
  if (!whole) return new Response('Not found', { status: 404 })
  const range = parseRange(req.headers.get('range'), whole.size)
  if (range === 'unsatisfiable') {
    await whole.body.cancel()
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${whole.size}` } })
  }
  if (!range) {
    return new Response(whole.body, {
      headers: { ...HEADERS, 'Content-Type': whole.contentType, 'Content-Length': String(whole.size) },
    })
  }
  await whole.body.cancel()
  const part = (await openImage(key, range))!
  return new Response(part.body, {
    status: 206,
    headers: {
      ...HEADERS,
      'Content-Type': part.contentType,
      'Content-Length': String(range.end - range.start + 1),
      'Content-Range': `bytes ${range.start}-${range.end}/${part.size}`,
    },
  })
}
