import { MAX_UPLOAD_BODY_BYTES } from '@/lib/image-rules'
import { requireUser } from '@/lib/session'
import { creativeUrl, putCreative } from '@/lib/storage'

const bad = (status: 400 | 413, error = 'BAD_IMAGE') => Response.json({ error }, { status })

export async function POST(req: Request) {
  await requireUser()
  // formData() buffers the whole body, and nothing upstream caps it, so refuse by declared size first.
  const declared = Number(req.headers.get('content-length') ?? NaN)
  if (!Number.isInteger(declared) || declared < 0 || declared > MAX_UPLOAD_BODY_BYTES) return bad(413)
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return bad(400)
  try {
    // The kind (image or video) is inferred from the file's type, never hinted by the client.
    const { key, kind } = await putCreative(file)
    return Response.json({ key, kind, url: creativeUrl(key) })
  } catch (e) {
    if (e === 'too_large') return bad(413, 'too_large')
    if (e === 'unsupported_type') return bad(400)
    throw e
  }
}
