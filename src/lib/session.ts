import 'server-only'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export type SessionUser = { id: string; email: string; name: string; isGlobalAdmin: boolean }

// The JWT can outlive a demotion or deletion, so the database decides.
export async function isAdminInDb(userId: string): Promise<boolean> {
  const row = await db.user.findUnique({ where: { id: userId }, select: { isGlobalAdmin: true } })
  return row?.isGlobalAdmin === true
}

export async function requireUser(): Promise<SessionUser> {
  const session = await auth()
  const u = session?.user
  if (!u?.id) redirect('/sign-in')
  const row = await db.user.findUnique({ where: { id: u.id }, select: { id: true } })
  if (!row) redirect('/sign-in')
  return { id: u.id, email: u.email ?? '', name: u.name ?? '', isGlobalAdmin: u.isGlobalAdmin }
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser()
  if (!(await isAdminInDb(user.id))) notFound()
  return { ...user, isGlobalAdmin: true }
}
