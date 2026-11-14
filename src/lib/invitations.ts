import 'server-only'
import { randomBytes } from 'node:crypto'
import type { Invitation, Prisma, Role } from '@prisma/client'
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
  const now = new Date()
  await db.$transaction(async (tx) => {
    // The claim is atomic: of two concurrent accepts only one flips acceptedAt.
    const claimed = await tx.invitation.updateMany({
      where: { id: inv.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
      data: { acceptedAt: now },
    })
    if (claimed.count !== 1) throw 'INVALID'
    const existing = await tx.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: user.id, workspaceId: inv.workspaceId } },
    })
    if (!existing) {
      await tx.workspaceMember.create({ data: { userId: user.id, workspaceId: inv.workspaceId, role: inv.role } })
    }
  })
  await audit(user.id, 'member.join', { type: 'Invitation', id: inv.id, workspaceId: inv.workspaceId }, undefined, {
    invitedEmail: inv.email,
    acceptedEmail: user.email,
    role: inv.role,
  })
  return { workspaceId: inv.workspaceId, role: inv.role }
}

// Serialises Owner changes per workspace so two Owners can't demote each other into zero Owners.
async function guardedOwnerChange(
  workspaceId: string,
  userId: string,
  change: (tx: Prisma.TransactionClient, current: Role) => Promise<void>,
  isLoss: (current: Role) => boolean,
): Promise<Role> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspaceId} FOR UPDATE`
    const m = await tx.workspaceMember.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } })
    if (!m) throw 'NOT_FOUND'
    if (isLoss(m.role)) {
      const others = await tx.workspaceMember.count({ where: { workspaceId, role: 'Owner', userId: { not: userId } } })
      if (others === 0) throw 'LAST_OWNER'
    }
    await change(tx, m.role)
    return m.role
  })
}

export async function changeRole(workspaceId: string, userId: string, role: Role, byUserId: string): Promise<void> {
  const before = await guardedOwnerChange(
    workspaceId,
    userId,
    (tx, current) =>
      current === role
        ? Promise.resolve()
        : tx.workspaceMember.update({ where: { userId_workspaceId: { userId, workspaceId } }, data: { role } }).then(() => {}),
    (current) => current === 'Owner' && role !== 'Owner',
  )
  if (before !== role) await audit(byUserId, 'member.role', { type: 'User', id: userId, workspaceId }, { role: before }, { role })
}

export async function removeMember(workspaceId: string, userId: string, byUserId: string): Promise<void> {
  const before = await guardedOwnerChange(
    workspaceId,
    userId,
    (tx) => tx.workspaceMember.delete({ where: { userId_workspaceId: { userId, workspaceId } } }).then(() => {}),
    (current) => current === 'Owner',
  )
  await audit(byUserId, 'member.remove', { type: 'User', id: userId, workspaceId }, { role: before })
}
