import 'server-only'
import { cookies } from 'next/headers'
import { ACTIVE_WORKSPACE_COOKIE } from '@/lib/active-workspace'
import { INVITE_PAGE } from '@/lib/copy-people'
import { acceptInvite, validInvite } from '@/lib/invitations'

// The query a join lands with: the workspace's home reads it and says whom they joined as (once; the page then
// drops it from the address bar).
export const JOINED_PARAM = 'joined'
export const joinedHref = (workspaceId: string) => `/app?${JOINED_PARAM}=${encodeURIComponent(workspaceId)}`

// After a sign-up or sign-in that carried an invite token: join, and open that workspace. Returns the workspace
// joined, or null for a dead token, which is ignored: the person is still signed in and lands on /app.
export async function joinFromInvite(token: string, user: { id: string; email: string }): Promise<string | null> {
  try {
    const { workspaceId } = await acceptInvite(token, user)
    ;(await cookies()).set(ACTIVE_WORKSPACE_COOKIE, workspaceId, { httpOnly: true, sameSite: 'lax', path: '/' })
    return workspaceId
  } catch (e) {
    if (e !== 'INVALID' && e !== 'EXPIRED') throw e
    return null
  }
}

// What a sign-up or sign-in page opened from an invite link (`?invite=`) shows: the line naming the workspace and
// role it joins, and the invited address to start the email at (editable: the link is the credential, ruling 38).
// 'invalid' for a link that can no longer be accepted; null when the page was opened without one.
export type InviteContext = { token: string; email: string; joining: string }

export async function inviteContext(raw: unknown): Promise<InviteContext | 'invalid' | null> {
  const token = typeof raw === 'string' ? raw : ''
  if (!token) return null
  const inv = await validInvite(token)
  if (!inv) return 'invalid'
  return { token, email: inv.email, joining: INVITE_PAGE.joining(inv.workspace.name, inv.role) }
}
