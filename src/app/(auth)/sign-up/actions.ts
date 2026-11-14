'use server'

import { z } from 'zod'
import { clearActiveWorkspace } from '@/lib/active-workspace'
import { signIn } from '@/lib/auth'
import { COPY } from '@/lib/copy'
import { joinFromInvite } from '@/lib/invite-join'
import { createUser, MIN_PASSWORD_LENGTH } from '@/lib/users'

const schema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  password: z.string().min(MIN_PASSWORD_LENGTH),
})

export async function signUpAction(_prev: string | null, formData: FormData): Promise<string | null> {
  const parsed = schema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return COPY.auth.invalidSignUp
  const invite = String(formData.get('invite') ?? '')
  try {
    const user = await createUser(parsed.data)
    // A new account starts outside whatever workspace this browser last had open (an invite then opens its own).
    await clearActiveWorkspace()
    if (invite) await joinFromInvite(invite, user)
  } catch (e) {
    if (e === 'EMAIL_TAKEN') return COPY.auth.emailTaken
    throw e
  }
  // signIn redirects (by throwing); the new account always has valid credentials.
  await signIn('credentials', {
    email: parsed.data.email,
    password: parsed.data.password,
    redirectTo: '/app',
  })
  return null
}
