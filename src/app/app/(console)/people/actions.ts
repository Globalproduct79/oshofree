'use server'

import type { Role } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { changeRole, invite, inviteUrl, removeMember, revokeInvite } from '@/lib/invitations'
import { requireMember } from '@/lib/permissions'

const ROLES: Role[] = ['Owner', 'Manager', 'Viewer']
const isRole = (r: string): r is Role => (ROLES as string[]).includes(r)

export type InviteResult = { ok: true; url: string } | { error: 'INVALID_EMAIL' | 'ALREADY_MEMBER' }

// The new invite's link goes back in this response only, to the Owner (or Global) who made it, for the invite page
// to show; no other page or person receives it from here.
export async function inviteAction(email: string, role: string): Promise<InviteResult> {
  const { user, workspace } = await requireMember('people')
  if (!isRole(role)) return { error: 'INVALID_EMAIL' }
  let token: string
  try {
    token = (await invite(workspace.id, user.id, email, role)).token
  } catch (e) {
    if (e === 'INVALID_EMAIL' || e === 'ALREADY_MEMBER') return { error: e }
    throw e
  }
  revalidatePath('/app/people')
  return { ok: true, url: inviteUrl(token) }
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
