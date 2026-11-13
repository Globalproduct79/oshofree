'use server'

import { AuthError } from 'next-auth'
import { signIn } from '@/lib/auth'
import { COPY } from '@/lib/copy'

// Auth.js hands us an absolute callbackUrl; keep only same-origin paths (no open redirect).
function safeRedirect(raw: string): string {
  try {
    const base = new URL(process.env.APP_URL ?? 'http://localhost:3100')
    const url = new URL(raw, base)
    if (url.origin !== base.origin) return '/app'
    return url.pathname + url.search
  } catch {
    return '/app'
  }
}

export async function signInAction(_prev: string | null, formData: FormData): Promise<string | null> {
  const redirectTo = safeRedirect(String(formData.get('callbackUrl') ?? ''))
  try {
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
