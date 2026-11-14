'use server'

import { revalidatePath } from 'next/cache'
import { rotateKey } from '@/lib/channels'
import { API_COPY } from '@/lib/copy-api'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/session'

// Global rotates Phoenix's key; the plain key comes back in this answer only and is never stored.
export async function rotateKeyAction(): Promise<{ key: string } | { error: string }> {
  const admin = await requireAdmin()
  const channel = await db.channel.findUnique({ where: { key: 'phoenix' }, select: { id: true } })
  if (!channel) return { error: API_COPY.keys.notSetUp }
  const key = await rotateKey(channel.id, admin.id)
  revalidatePath('/admin/api')
  return { key }
}
