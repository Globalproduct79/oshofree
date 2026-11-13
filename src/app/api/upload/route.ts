import { MAX_UPLOAD_BODY_BYTES } from '@/lib/image-rules'
import { requireUser } from '@/lib/session'
import { imageUrl, putImage } from '@/lib/storage'

const bad = (status: 400 | 413) => Response.json({ error: 'BAD_IMAGE' }, { status })

export async function POST(req: Request) {
  await requireUser()
  // formData() buffers the whole body, and nothing upstream caps it, so refuse by declared size first.
  const declared = Number(req.headers.get('content-length') ?? NaN)
  if (!Number.isInteger(declared) || declared < 0 || declared > MAX_UPLOAD_BODY_BYTES) return bad(413)
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return bad(400)
  try {
    const key = await putImage(file)
    return Response.json({ key, url: imageUrl(key) })
  } catch (e) {
    if (e === 'BAD_IMAGE') return bad(400)
    throw e
  }
}
