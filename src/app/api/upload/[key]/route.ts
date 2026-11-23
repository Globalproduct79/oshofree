import { discardUpload } from '@/lib/creative-uploads'
import { requireUser } from '@/lib/session'

const STATUS = { deleted: 204, not_found: 404, in_use: 409 } as const

// The campaign form lets go of a file it uploaded (Replace, Remove, a placement switch, Start over): deleted when the
// signed-in person sent it and no campaign or revision names it (creative-uploads.ts). 404 for any other key.
export async function DELETE(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const user = await requireUser()
  const outcome = await discardUpload((await params).key, user.id)
  return new Response(null, { status: STATUS[outcome] })
}
