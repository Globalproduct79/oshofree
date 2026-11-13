'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/session'

export async function openWorkspace(id: string): Promise<void> {
  await requireAdmin()
  if (!(await db.workspace.findUnique({ where: { id }, select: { id: true } }))) throw 'UNKNOWN_WORKSPACE'
  // No maxAge: a session cookie, gone when the browser closes.
  ;(await cookies()).set('og_ws', id, { httpOnly: true, sameSite: 'lax', path: '/' })
  redirect('/app')
}

export async function exitWorkspace(): Promise<void> {
  await requireAdmin()
  ;(await cookies()).delete('og_ws')
  redirect('/admin/advertisers')
}
