'use server'

import type { NotificationKind } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { markRead, setPref } from '@/lib/notifications'
import { requireMember } from '@/lib/permissions'
import { requireUser } from '@/lib/session'

// A bell item clicked: read for this user only (members and Global alike), so the count refreshes.
export async function markReadAction(id: string): Promise<void> {
  const user = await requireUser()
  await markRead(id, user.id)
  revalidatePath('/', 'layout')
}

const PREF_KINDS: NotificationKind[] = ['approved', 'credit', 'pace', 'ended', 'weekly']

// One toggle on the Notifications page: Owner or Global, for the active workspace, own prefs.
export async function setPrefAction(kind: string, enabled: boolean): Promise<void> {
  const { user, workspace } = await requireMember('settings')
  if (!(PREF_KINDS as string[]).includes(kind)) throw 'INVALID_KIND'
  await setPref(user.id, workspace.id, kind as NotificationKind, enabled)
}
