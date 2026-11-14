'use server'

import { redirect } from 'next/navigation'
import { setActiveWorkspace } from '@/lib/active-workspace'
import { acceptInvite } from '@/lib/invitations'
import { requireUser } from '@/lib/session'

export async function acceptInviteAction(token: string): Promise<void> {
  const user = await requireUser()
  let workspaceId: string
  try {
    ;({ workspaceId } = await acceptInvite(token, user))
  } catch (e) {
    if (e === 'INVALID' || e === 'EXPIRED') redirect(`/invite/${token}`)
    throw e
  }
  await setActiveWorkspace(workspaceId)
  redirect('/app')
}
