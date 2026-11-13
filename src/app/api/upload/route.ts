import { requireUser } from '@/lib/session'
import { imageUrl, putImage } from '@/lib/storage'

const bad = () => Response.json({ error: 'BAD_IMAGE' }, { status: 400 })

export async function POST(req: Request) {
  await requireUser()
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return bad()
  try {
    const key = await putImage(file)
    return Response.json({ key, url: imageUrl(key) })
  } catch (e) {
    if (e === 'BAD_IMAGE') return bad()
    throw e
  }
}
