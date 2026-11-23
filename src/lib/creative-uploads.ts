import 'server-only'
import { db } from '@/lib/db'
import { CREATIVE_KEY_RE } from '@/lib/image-rules'
import { deleteCreative } from '@/lib/storage'

// Who uploaded which creative file (slice 2, Prompt 2). The campaign form deletes the files it uploaded and then let
// go of (Replace, Remove, a placement switch, Start over), so they do not pile up on disk; only the person who sent a
// file may have it deleted, and never while a campaign or a revision waiting for review names it.

export function recordUpload(key: string, userId: string) {
  return db.creativeUpload.create({ data: { key, userId } })
}

// True while a campaign runs this file, or a revision waiting for review (or one decided since) names it.
async function inUse(key: string): Promise<boolean> {
  const campaign = await db.campaign.findFirst({
    where: { OR: [{ creativeImageKey: key }, { creativeVideoKey: key }] },
    select: { id: true },
  })
  if (campaign) return true
  const revision = await db.campaignRevision.findFirst({
    where: { OR: [{ data: { path: ['creativeImageKey'], equals: key } }, { data: { path: ['creativeVideoKey'], equals: key } }] },
    select: { id: true },
  })
  return revision !== null
}

export type Discarded = 'deleted' | 'not_found' | 'in_use'

// Deletes the file and its record when `userId` uploaded it and nothing names it. `not_found` for a key that is not
// theirs (or not a key at all), so nobody learns of another person's upload.
export async function discardUpload(key: string, userId: string): Promise<Discarded> {
  if (!CREATIVE_KEY_RE.test(key)) return 'not_found'
  const mine = await db.creativeUpload.findFirst({ where: { key, userId }, select: { key: true } })
  if (!mine) return 'not_found'
  if (await inUse(key)) return 'in_use'
  await deleteCreative(key)
  await db.creativeUpload.delete({ where: { key } })
  return 'deleted'
}
