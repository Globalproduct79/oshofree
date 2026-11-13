'use server'

import { clearActiveWorkspace, setActiveWorkspace } from '@/lib/active-workspace'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/session'

export async function openWorkspace(id: string): Promise<void> {
  await requireAdmin()
  if (!(await db.workspace.findUnique({ where: { id }, select: { id: true } }))) throw 'UNKNOWN_WORKSPACE'
  await setActiveWorkspace(id)
  redirect('/app')
}

export async function exitWorkspace(): Promise<void> {
  await requireAdmin()
  await clearActiveWorkspace()
  redirect('/admin/advertisers')
}
