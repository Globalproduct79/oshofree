'use server'

import { AuthError } from 'next-auth'
import { clearActiveWorkspace } from '@/lib/active-workspace'
import { appUrl } from '@/lib/app-url'
import { signIn } from '@/lib/auth'
import { COPY } from '@/lib/copy'
import { joinedHref, joinFromInvite } from '@/lib/invite-join'
import { verifyCredentials } from '@/lib/users'

// Auth.js hands us an absolute callbackUrl; keep only same-origin paths (no open redirect).
function safeRedirect(raw: string): string {
  if (!raw) return '/app'
  try {
    const base = new URL(appUrl())
    const url = new URL(raw, base)
    if (url.origin !== base.origin) return '/app'
    if (url.pathname === '/') return '/app'
    return url.pathname + url.search
  } catch {
    return '/app'
  }
}

export async function signInAction(_prev: string | null, formData: FormData): Promise<string | null> {
  const invite = String(formData.get('invite') ?? '')
  // An invite that joins lands on that workspace's home, which says so.
  let redirectTo = invite ? '/app' : safeRedirect(String(formData.get('callbackUrl') ?? ''))
  // A fresh session never inherits the last one's workspace: Global would land inside it, unaudited.
  await clearActiveWorkspace()
  try {
    if (invite) {
      const user = await verifyCredentials(String(formData.get('email') ?? ''), String(formData.get('password') ?? ''))
      const joined = user ? await joinFromInvite(invite, user) : null
      if (joined) redirectTo = joinedHref(joined)
    }
    await signIn('credentials', {
      email: String(formData.get('email') ?? ''),
      password: String(formData.get('password') ?? ''),
      redirectTo,
    })
  } catch (e) {
    if (e instanceof AuthError) return COPY.auth.badCredentials
    throw e // the redirect after a successful sign-in is thrown too
  }
  return null
}
