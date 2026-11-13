'use server'

import { revalidatePath } from 'next/cache'
import { markRead } from '@/lib/notifications'
import { requireUser } from '@/lib/session'

// A bell item clicked: read for this user only (members and Global alike), so the count refreshes.
export async function markReadAction(id: string): Promise<void> {
  const user = await requireUser()
  await markRead(id, user.id)
  revalidatePath('/', 'layout')
}
