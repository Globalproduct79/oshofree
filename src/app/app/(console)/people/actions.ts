'use server'

import type { Role } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { changeRole, invite, removeMember, revokeInvite } from '@/lib/invitations'
import { requireMember } from '@/lib/permissions'

const ROLES: Role[] = ['Owner', 'Manager', 'Viewer']
const isRole = (r: string): r is Role => (ROLES as string[]).includes(r)

export type InviteResult = { ok: true } | { error: 'INVALID_EMAIL' | 'ALREADY_MEMBER' }

export async function inviteAction(email: string, role: string): Promise<InviteResult> {
  const { user, workspace } = await requireMember('people')
  if (!isRole(role)) return { error: 'INVALID_EMAIL' }
  try {
    await invite(workspace.id, user.id, email, role)
  } catch (e) {
    if (e === 'INVALID_EMAIL' || e === 'ALREADY_MEMBER') return { error: e }
    throw e
  }
  revalidatePath('/app/people')
  return { ok: true }
}

export async function changeRoleAction(userId: string, role: string): Promise<{ error?: 'LAST_OWNER' }> {
  const { user, workspace } = await requireMember('people')
  if (!isRole(role)) throw 'INVALID_ROLE'
  try {
    await changeRole(workspace.id, userId, role, user.id)
  } catch (e) {
    if (e === 'LAST_OWNER') return { error: e }
    throw e
  }
  revalidatePath('/app/people')
  return {}
}

export async function removeMemberAction(userId: string): Promise<{ error?: 'LAST_OWNER' }> {
  const { user, workspace } = await requireMember('people')
  try {
    await removeMember(workspace.id, userId, user.id)
  } catch (e) {
    if (e === 'LAST_OWNER') return { error: e }
    throw e
  }
  revalidatePath('/app/people')
  return {}
}

export async function revokeInviteAction(id: string): Promise<void> {
  const { user, workspace } = await requireMember('people')
  await revokeInvite(id, user.id, workspace.id)
  revalidatePath('/app/people')
}
