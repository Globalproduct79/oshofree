import 'server-only'
import type { Workspace, WorkspaceType } from '@prisma/client'
import { db, type Tx } from '@/lib/db'
import type { Country } from '@/lib/markets'
import { requireMember } from '@/lib/permissions'

export type WorkspaceInput = { name: string; type: WorkspaceType; country: Country }

export async function createWorkspace(userId: string, input: WorkspaceInput): Promise<Workspace> {
  return db.$transaction(async (tx) => {
    const existing = await tx.workspaceMember.findFirst({ where: { userId, role: 'Owner' } })
    if (existing) throw 'ALREADY_HAS_WORKSPACE'
    return tx.workspace.create({
      data: { ...input, members: { create: { userId, role: 'Owner' } } },
    })
  })
}

export async function workspaceForUser(userId: string): Promise<Workspace | null> {
  const m = await db.workspaceMember.findFirst({
    where: { userId },
    orderBy: { workspace: { createdAt: 'asc' } },
    include: { workspace: true },
  })
  return m?.workspace ?? null
}

// The active workspace for any signed-in member (see requireMember).
export async function requireWorkspace(): Promise<Workspace> {
  return (await requireMember('view')).workspace
}

export async function updateWorkspace(id: string, input: WorkspaceInput): Promise<Workspace> {
  return db.workspace.update({ where: { id }, data: input })
}

export async function setupChecklist(workspaceId: string) {
  const [anyCampaign, approved, share] = await Promise.all([
    db.campaign.findFirst({ where: { workspaceId }, select: { id: true } }),
    db.campaign.findFirst({ where: { workspaceId, status: { in: ['live', 'paused'] } }, select: { id: true } }),
    db.shareLink.findFirst({
      where: { sharerType: { not: 'Root' }, campaign: { workspaceId } },
      select: { id: true },
    }),
  ])
  return {
    workspace: true as const,
    firstCampaign: anyCampaign !== null,
    approvedCampaign: approved !== null,
    firstShare: share !== null,
  }
}

// True when the user is looking at a workspace as Global rather than as a member.
export async function isImpersonating(userId: string, workspaceId: string): Promise<boolean> {
  const m = await requireMember('view')
  return m.user.id === userId && m.workspace.id === workspaceId && m.role === 'Global'
}

async function decide(tx: Tx, id: string, data: { status: 'approved' | 'declined'; declineReason?: string }) {
  const { count } = await tx.workspace.updateMany({ where: { id, status: 'pending' }, data })
  if (count === 0) throw 'INVALID_TRANSITION'
  return tx.workspace.findUniqueOrThrow({ where: { id } })
}

export function approveWorkspace(id: string, byUserId: string): Promise<Workspace> {
  return db.$transaction(async (tx) => {
    const ws = await decide(tx, id, { status: 'approved' })
    await tx.reviewAction.create({ data: { targetType: 'Workspace', targetId: id, action: 'Approve', byUserId } })
    return ws
  })
}

export async function declineWorkspace(id: string, byUserId: string, reason: string): Promise<Workspace> {
  const why = reason.trim()
  if (!why) throw 'REASON_REQUIRED'
  return db.$transaction(async (tx) => {
    const ws = await decide(tx, id, { status: 'declined', declineReason: why })
    await tx.reviewAction.create({
      data: { targetType: 'Workspace', targetId: id, action: 'Decline', reason: why, byUserId },
    })
    return ws
  })
}
