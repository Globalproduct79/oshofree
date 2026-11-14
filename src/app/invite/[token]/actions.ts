'use server'

import { redirect } from 'next/navigation'
import { clearActiveWorkspace, setActiveWorkspace } from '@/lib/active-workspace'
import { signOut } from '@/lib/auth'
import { joinedHref } from '@/lib/invite-join'
import { acceptInvite } from '@/lib/invitations'
import { requireUser } from '@/lib/session'

// "Accept as {name}": the signed-in account joins, and lands on the workspace's home, which says so.
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
  redirect(joinedHref(workspaceId))
}

// "Sign in as someone else": sign out (leaving the workspace, as the switcher's Sign out does), then sign-in with
// the same link, which joins whoever signs in there.
export async function signInAsSomeoneElseAction(token: string): Promise<void> {
  await clearActiveWorkspace()
  await signOut({ redirectTo: `/sign-in?invite=${encodeURIComponent(token)}` })
}
