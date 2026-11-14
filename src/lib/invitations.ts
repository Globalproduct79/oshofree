import 'server-only'
import { randomBytes } from 'node:crypto'
import type { Invitation, Prisma, Role } from '@prisma/client'
import { audit } from '@/lib/audit'
import { db } from '@/lib/db'

const WEEK = 7 * 86_400_000
const EMAIL = /^\S+@\S+\.\S+$/

export const inviteUrl = (token: string) => `${process.env.APP_URL ?? ''}/invite/${token}`

// An invite's bearer token: 32 hex characters.
const newToken = () => randomBytes(16).toString('hex')

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

export type OpenInvite = { id: string; email: string; role: Role; invitedBy: string | null; expiresAt: Date }

// Invites not yet accepted or revoked, expired ones included (Resend revives them), with who sent each. The token
// is never read: a page that lists invites carries no link; only an invite's or a resend's own response does.
export async function openInvites(workspaceId: string): Promise<OpenInvite[]> {
  const rows = await db.invitation.findMany({
    where: { workspaceId, acceptedAt: null, revokedAt: null },
    select: { id: true, email: true, role: true, invitedById: true, expiresAt: true },
    orderBy: { expiresAt: 'asc' },
  })
  const inviters = await db.user.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.invitedById))] } },
    select: { id: true, name: true },
  })
  const name = new Map(inviters.map((u) => [u.id, u.name]))
  return rows.map(({ invitedById, ...r }) => ({ ...r, invitedBy: name.get(invitedById) ?? null }))
}

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
        token: newToken(),
        invitedById: byUserId,
        expiresAt: new Date(now.getTime() + WEEK),
      },
    })
  })
  await audit(byUserId, 'member.invite', { type: 'Invitation', id: created.id, workspaceId }, undefined, { email, role })
  return created
}

// True when this call revoked the invite; false when it was already accepted or revoked (left as it is). One
// guarded write, so an accept that lands first wins.
export async function revokeInvite(id: string, byUserId: string, workspaceId?: string): Promise<boolean> {
  const inv = await db.invitation.findUnique({ where: { id }, select: { workspaceId: true, email: true } })
  if (!inv || (workspaceId && inv.workspaceId !== workspaceId)) throw 'NOT_FOUND'
  const done = await db.invitation.updateMany({
    where: { id, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  if (done.count !== 1) return false
  await audit(byUserId, 'invite.revoke', { type: 'Invitation', id, workspaceId: inv.workspaceId }, { email: inv.email })
  return true
}

// A new link for an invite not yet accepted or revoked (an expired one too): a new token, so the old link stops
// working, valid for another week. One guarded write, so an accept or a revoke that lands first wins. The audit row
// names the address and role, never a token.
export async function resendInvite(id: string, byUserId: string, workspaceId: string): Promise<Invitation> {
  const done = await db.invitation.updateMany({
    where: { id, workspaceId, acceptedAt: null, revokedAt: null },
    data: { token: newToken(), expiresAt: new Date(Date.now() + WEEK) },
  })
  if (done.count !== 1) {
    const inv = await db.invitation.findUnique({ where: { id }, select: { workspaceId: true } })
    throw inv?.workspaceId === workspaceId ? 'NOT_PENDING' : 'NOT_FOUND'
  }
  const inv = await db.invitation.findUniqueOrThrow({ where: { id } })
  await audit(byUserId, 'invite.resend', { type: 'Invitation', id, workspaceId }, undefined, { email: inv.email, role: inv.role })
  return inv
}

export async function findInvite(token: string) {
  return db.invitation.findUnique({ where: { token }, include: { workspace: true } })
}

// An invite its link can still accept (not accepted, revoked or expired), with its workspace; null for any other
// token. The invite, sign-up and sign-in pages show what it offers; none of them shows the token.
export async function validInvite(token: string) {
  if (!token) return null
  const inv = await findInvite(token)
  return inv && !inv.acceptedAt && !inv.revokedAt && inv.expiresAt.getTime() > Date.now() ? inv : null
}

export async function acceptInvite(token: string, user: { id: string; email: string }) {
  const inv = await db.invitation.findUnique({ where: { token } })
  if (!inv || inv.revokedAt || inv.acceptedAt) throw 'INVALID'
  if (inv.expiresAt.getTime() <= Date.now()) throw 'EXPIRED'
  const now = new Date()
  await db.$transaction(async (tx) => {
    // The claim is atomic: of two concurrent accepts only one flips acceptedAt. It matches the token it was given
    // too, so a link Resend retired after the lookup above is refused.
    const claimed = await tx.invitation.updateMany({
      where: { id: inv.id, token, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
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
