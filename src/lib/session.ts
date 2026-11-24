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
  const row = await db.user.findUnique({
    where: { id: u.id },
    select: { id: true, email: true, name: true, isGlobalAdmin: true },
  })
  if (!row) redirect('/sign-in')
  // The database decides, not the JWT, which can outlive a demotion (and a rename: the name is on the topbar).
  return { id: row.id, email: row.email, name: row.name, isGlobalAdmin: row.isGlobalAdmin }
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser()
  if (!(await isAdminInDb(user.id))) notFound()
  return { ...user, isGlobalAdmin: true }
}
