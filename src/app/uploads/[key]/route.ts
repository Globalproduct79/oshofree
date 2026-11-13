import { openImage } from '@/lib/storage'

// Public on purpose: the consumer landing page and the Phoenix wall load images without a session.
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const image = await openImage((await params).key)
  if (!image) return new Response('Not found', { status: 404 })
  return new Response(image.body, {
    headers: {
      'Content-Type': image.contentType,
      'Content-Length': String(image.size),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
