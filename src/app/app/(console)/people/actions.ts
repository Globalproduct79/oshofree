'use server'

import type { Role } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { fd } from '@/lib/format'
import { changeRole, invite, inviteUrl, removeMember, resendInvite, revokeInvite } from '@/lib/invitations'
import { MARKETS, type Country } from '@/lib/markets'
import { requireMember } from '@/lib/permissions'

const ROLES: Role[] = ['Owner', 'Manager', 'Viewer']
const isRole = (r: string): r is Role => (ROLES as string[]).includes(r)

// Both pages that list the team and its invites.
const revalidate = () => {
  revalidatePath('/app/people')
  revalidatePath('/app/organisation')
}
const expiry = (at: Date, country: Country) => fd(at, MARKETS[country].timezone)

export type InviteResult =
  | { ok: true; url: string; id: string; email: string; role: Role; expires: string }
  | { error: 'INVALID_EMAIL' | 'ALREADY_MEMBER' }

// The new invite's link goes back in this response only, to the Owner (or Global) who made it, for the invite page
// to show with the pending invite; no other page or person receives it from here.
export async function inviteAction(email: string, role: string): Promise<InviteResult> {
  const { user, workspace } = await requireMember('people')
  if (!isRole(role)) return { error: 'INVALID_EMAIL' }
  let made: Awaited<ReturnType<typeof invite>>
  try {
    made = await invite(workspace.id, user.id, email, role)
  } catch (e) {
    if (e === 'INVALID_EMAIL' || e === 'ALREADY_MEMBER') return { error: e }
    throw e
  }
  revalidate()
  return {
    ok: true,
    url: inviteUrl(made.token),
    id: made.id,
    email: made.email,
    role: made.role,
    expires: expiry(made.expiresAt, workspace.country),
  }
}

export type ResendResult = { ok: true; link: string; expires: string } | { error: 'GONE' }

// A new link for an open (or expired) invite; the old link stops working. Like inviteAction, the link goes back
// in this response only, to the Owner (or Global) who clicked Resend. An invite accepted or revoked meanwhile is GONE.
export async function resendInviteAction(id: string): Promise<ResendResult> {
  const { user, workspace } = await requireMember('people')
  let again: Awaited<ReturnType<typeof resendInvite>>
  try {
    again = await resendInvite(id, user.id, workspace.id)
  } catch (e) {
    if (e === 'NOT_PENDING') return { error: 'GONE' }
    throw e
  }
  revalidate()
  return { ok: true, link: inviteUrl(again.token), expires: expiry(again.expiresAt, workspace.country) }
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
  revalidate()
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
  revalidate()
  return {}
}

export async function revokeInviteAction(id: string): Promise<void> {
  const { user, workspace } = await requireMember('people')
  await revokeInvite(id, user.id, workspace.id)
  revalidate()
}
