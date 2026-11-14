'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { clearActiveWorkspace, setActiveWorkspace } from '@/lib/active-workspace'
import { signOut } from '@/lib/auth'
import { requireAdmin } from '@/lib/session'

// The switcher's rows. setActiveWorkspace refuses a workspace the user is not in (Global may enter
// any, and that entry is audited).
export async function switchWorkspaceAction(id: string): Promise<void> {
  await setActiveWorkspace(id)
  revalidatePath('/', 'layout')
  redirect('/app')
}

// The search palette's campaign hit for Global: enter that workspace and land on the page. Only
// in-app paths are followed.
export async function switchWorkspaceToAction(id: string, next: string): Promise<void> {
  await setActiveWorkspace(id)
  revalidatePath('/', 'layout')
  redirect(/^\/app(\/[\w-]+)*$/.test(next) ? next : '/app')
}

// "Platform (Global)" and the banner's "Back to Platform": leave the workspace, land on Review.
export async function switchToPlatformAction(): Promise<void> {
  await requireAdmin()
  await clearActiveWorkspace()
  revalidatePath('/', 'layout')
  redirect('/admin/review')
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: '/sign-in' })
}
