import 'server-only'
import { cookies } from 'next/headers'
import { ACTIVE_WORKSPACE_COOKIE } from '@/lib/active-workspace'
import { acceptInvite } from '@/lib/invitations'

// After a sign-up or sign-in that carried an invite token: join, and open that workspace.
// A dead token is ignored; the person is still signed in and lands on /app.
export async function joinFromInvite(token: string, user: { id: string; email: string }): Promise<void> {
  try {
    const { workspaceId } = await acceptInvite(token, user)
    ;(await cookies()).set(ACTIVE_WORKSPACE_COOKIE, workspaceId, { httpOnly: true, sameSite: 'lax', path: '/' })
  } catch (e) {
    if (e !== 'INVALID' && e !== 'EXPIRED') throw e
  }
}
