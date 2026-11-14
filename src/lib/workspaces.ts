import 'server-only'
import type { Workspace, WorkspaceType } from '@prisma/client'
import { audit } from '@/lib/audit'
import { NOTIFY } from '@/lib/copy-notifications'
import { db, type Tx } from '@/lib/db'
import type { Country } from '@/lib/markets'
import { notifyWorkspace } from '@/lib/notifications'
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

export type WorkspaceUpdate = Partial<WorkspaceInput> & { registrationNumber?: string | null }

export async function updateWorkspace(id: string, input: WorkspaceUpdate): Promise<Workspace> {
  return db.workspace.update({ where: { id }, data: input })
}

// True when the user is looking at a workspace as Global rather than as a member.
export async function isImpersonating(userId: string, workspaceId: string): Promise<boolean> {
  const m = await requireMember('view')
  return m.user.id === userId && m.workspace.id === workspaceId && m.role === 'Global'
}

async function decide(
  tx: Tx, id: string, data: { status: 'approved'; approvedAt: Date } | { status: 'declined'; declineReason: string },
) {
  const { count } = await tx.workspace.updateMany({ where: { id, status: 'pending' }, data })
  if (count === 0) throw 'INVALID_TRANSITION'
  return tx.workspace.findUniqueOrThrow({ where: { id } })
}

// The Workspace page shows the decision, so its notification links there.
const WORKSPACE_PAGE = '/app/workspace'

// Global's decision on a new advertiser: the status and the decision commit together, then it is audited and
// the workspace's members hear it (GLB §1.6; the prototype told nobody about a decline, D4).
export async function approveWorkspace(id: string, byUserId: string, now = new Date()): Promise<Workspace> {
  const ws = await db.$transaction(async (tx) => {
    const row = await decide(tx, id, { status: 'approved', approvedAt: now })
    await tx.reviewAction.create({ data: { targetType: 'Workspace', targetId: id, action: 'Approve', byUserId, at: now } })
    return row
  })
  await audit(byUserId, 'workspace.approve', { type: 'Workspace', id, workspaceId: id }, { status: 'pending' }, { status: 'approved' })
  const told = NOTIFY.workspaceApproved()
  await notifyWorkspace(id, 'approved', told.title, told.detail, WORKSPACE_PAGE)
  return ws
}

export async function declineWorkspace(id: string, byUserId: string, reason: string, now = new Date()): Promise<Workspace> {
  const why = reason.trim()
  if (!why) throw 'REASON_REQUIRED'
  const ws = await db.$transaction(async (tx) => {
    const row = await decide(tx, id, { status: 'declined', declineReason: why })
    await tx.reviewAction.create({
      data: { targetType: 'Workspace', targetId: id, action: 'Decline', reason: why, byUserId, at: now },
    })
    return row
  })
  await audit(byUserId, 'workspace.decline', { type: 'Workspace', id, workspaceId: id }, { status: 'pending' },
    { status: 'declined', declineReason: why })
  const told = NOTIFY.workspaceDeclined(why)
  await notifyWorkspace(id, 'approved', told.title, told.detail, WORKSPACE_PAGE)
  return ws
}

const since = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })

// The Status box on the Workspace page (ADV §10), as data.
export function workspaceStatusBox(ws: Pick<Workspace, 'status' | 'creditLimitCents' | 'createdAt'>) {
  return {
    approval: ws.status,
    creditLimitCents: ws.creditLimitCents,
    channels: 'Phoenix',
    since: since.format(ws.createdAt).replace(/^Sept\b/, 'Sep'),
  }
}

// An agency's client brands: the distinct Campaign.brand values with their campaign counts.
export async function clientBrands(workspaceId: string): Promise<{ brand: string; campaigns: number }[]> {
  const rows = await db.campaign.groupBy({ by: ['brand'], where: { workspaceId }, _count: { _all: true } })
  return rows
    .map((r) => ({ brand: r.brand, campaigns: r._count._all }))
    .sort((a, b) => b.campaigns - a.campaigns || a.brand.localeCompare(b.brand))
}
