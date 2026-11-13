import 'server-only'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'

export type SessionUser = { id: string; email: string; name: string; isGlobalAdmin: boolean }

export async function requireUser(): Promise<SessionUser> {
  const session = await auth()
  const u = session?.user
  if (!u?.id) redirect('/sign-in')
  return { id: u.id, email: u.email ?? '', name: u.name ?? '', isGlobalAdmin: u.isGlobalAdmin }
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser()
  if (!user.isGlobalAdmin) notFound()
  return user
}
