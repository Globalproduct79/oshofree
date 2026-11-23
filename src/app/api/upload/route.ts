import { recordUpload } from '@/lib/creative-uploads'
import { MAX_UPLOAD_BODY_BYTES } from '@/lib/image-rules'
import { requireUser } from '@/lib/session'
import { creativeUrl, putCreative } from '@/lib/storage'

const bad = (status: 400 | 413, error = 'BAD_IMAGE') => Response.json({ error }, { status })

export async function POST(req: Request) {
  const user = await requireUser()
  // formData() buffers the whole body, and nothing upstream caps it, so refuse by declared size first (the
  // largest cap, an MP4's). This route is outside middleware.ts's matcher, so Next never clips the body at its
  // 10 MB middlewareClientMaxBodySize; widening the matcher to /api would cut videos short.
  const declared = Number(req.headers.get('content-length') ?? NaN)
  if (!Number.isInteger(declared) || declared < 0 || declared > MAX_UPLOAD_BODY_BYTES) return bad(413)
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return bad(400)
  try {
    // The kind (image or video) is inferred from the file's type, never hinted by the client. The placement the
    // picker sends only chooses between the image caps (a splash image may be larger); anything else reads as a card.
    const { key, kind } = await putCreative(file, { placement: form?.get('placement') })
    // Who sent it: only they may have it deleted when their form lets go of it (DELETE /api/upload/[key]).
    await recordUpload(key, user.id)
    return Response.json({ key, kind, url: creativeUrl(key) })
  } catch (e) {
    if (e === 'too_large') return bad(413, 'too_large')
    if (e === 'unsupported_type') return bad(400)
    throw e
  }
}
