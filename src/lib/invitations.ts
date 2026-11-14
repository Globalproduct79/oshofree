import 'server-only'
import { randomBytes } from 'node:crypto'
import type { Invitation, Role } from '@prisma/client'
import { audit } from '@/lib/audit'
import { db } from '@/lib/db'

const WEEK = 7 * 86_400_000
const EMAIL = /^\S+@\S+\.\S+$/

export const inviteUrl = (token: string) => `${process.env.APP_URL ?? ''}/invite/${token}`

export type MemberView = { userId: string; name: string; email: string; role: Role; isLastOwner: boolean }

export async function members(workspaceId: string): Promise<MemberView[]> {
  const rows = await db.workspaceMember.findMany({
    where: { workspaceId },
    include: { user: true },
    orderBy: { user: { createdAt: 'asc' } },
  })
  const owners = rows.filter((r) => r.role === 'Owner').length
  return rows.map((r) => ({
    userId: r.userId,
    name: r.user.name,
    email: r.user.email,
    role: r.role,
    isLastOwner: r.role === 'Owner' && owners === 1,
  }))
}

export const pendingInvites = (workspaceId: string) =>
  db.invitation.findMany({
    where: { workspaceId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { expiresAt: 'asc' },
  })

export async function invite(workspaceId: string, byUserId: string, rawEmail: string, role: Role): Promise<Invitation> {
  const email = rawEmail.trim().toLowerCase()
  if (!EMAIL.test(email)) throw 'INVALID_EMAIL'
  const member = await db.workspaceMember.findFirst({ where: { workspaceId, user: { email } } })
  if (member) throw 'ALREADY_MEMBER'
  const now = new Date()
  const created = await db.$transaction(async (tx) => {
    // A second invite to the same pending email replaces the first link.
    await tx.invitation.updateMany({
      where: { workspaceId, email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: now },
    })
    return tx.invitation.create({
      data: {
        workspaceId,
        email,
        role,
        token: randomBytes(16).toString('hex'),
        invitedById: byUserId,
        expiresAt: new Date(now.getTime() + WEEK),
      },
    })
  })
  await audit(byUserId, 'member.invite', { type: 'Invitation', id: created.id, workspaceId }, undefined, { email, role })
  return created
}

export async function revokeInvite(id: string, byUserId: string, workspaceId?: string): Promise<void> {
  const inv = await db.invitation.findUnique({ where: { id } })
  if (!inv || (workspaceId && inv.workspaceId !== workspaceId)) throw 'NOT_FOUND'
  if (inv.acceptedAt || inv.revokedAt) return
  await db.invitation.update({ where: { id }, data: { revokedAt: new Date() } })
  await audit(byUserId, 'invite.revoke', { type: 'Invitation', id, workspaceId: inv.workspaceId }, { email: inv.email })
}

export async function findInvite(token: string) {
  return db.invitation.findUnique({ where: { token }, include: { workspace: true } })
}

export async function acceptInvite(token: string, user: { id: string; email: string }) {
  const inv = await db.invitation.findUnique({ where: { token } })
  if (!inv || inv.revokedAt || inv.acceptedAt) throw 'INVALID'
  if (inv.expiresAt.getTime() <= Date.now()) throw 'EXPIRED'
  await db.$transaction(async (tx) => {
    const existing = await tx.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: user.id, workspaceId: inv.workspaceId } },
    })
    if (!existing) {
      await tx.workspaceMember.create({ data: { userId: user.id, workspaceId: inv.workspaceId, role: inv.role } })
    }
    await tx.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } })
  })
  return { workspaceId: inv.workspaceId, role: inv.role }
}

async function ownersOtherThan(workspaceId: string, userId: string) {
  return db.workspaceMember.count({ where: { workspaceId, role: 'Owner', userId: { not: userId } } })
}

export async function changeRole(workspaceId: string, userId: string, role: Role, byUserId: string): Promise<void> {
  const m = await db.workspaceMember.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } })
  if (!m) throw 'NOT_FOUND'
  if (m.role === role) return
  if (m.role === 'Owner' && (await ownersOtherThan(workspaceId, userId)) === 0) throw 'LAST_OWNER'
  await db.workspaceMember.update({ where: { userId_workspaceId: { userId, workspaceId } }, data: { role } })
  await audit(byUserId, 'member.role', { type: 'User', id: userId, workspaceId }, { role: m.role }, { role })
}

export async function removeMember(workspaceId: string, userId: string, byUserId: string): Promise<void> {
  const m = await db.workspaceMember.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } })
  if (!m) throw 'NOT_FOUND'
  if (m.role === 'Owner' && (await ownersOtherThan(workspaceId, userId)) === 0) throw 'LAST_OWNER'
  await db.workspaceMember.delete({ where: { userId_workspaceId: { userId, workspaceId } } })
  await audit(byUserId, 'member.remove', { type: 'User', id: userId, workspaceId }, { role: m.role })
}
