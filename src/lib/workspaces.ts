import type { Workspace, WorkspaceStatus, WorkspaceType } from '@prisma/client'
import { audit } from '@/lib/audit'
import { NOTIFY } from '@/lib/copy-notifications'
import { db, type Tx } from '@/lib/db'
import type { Country } from '@/lib/markets'
import { notifyWorkspace } from '@/lib/notifications'

// No server-only import and no session: the seed (under tsx) creates and approves workspaces through these.
// The signed-in member's workspace is permissions.ts's requireWorkspace.

export type WorkspaceInput = { name: string; type: WorkspaceType; country: Country }

// The Workspace page shows the approval status and decisions, so their notifications link there.
const WORKSPACE_PAGE = '/app/workspace'

// A new workspace waits for Global, and its owner is told so (ADV §12).
export async function createWorkspace(userId: string, input: WorkspaceInput): Promise<Workspace> {
  const ws = await db.$transaction(async (tx) => {
    const existing = await tx.workspaceMember.findFirst({ where: { userId, role: 'Owner' } })
    if (existing) throw 'ALREADY_HAS_WORKSPACE'
    return tx.workspace.create({
      data: { ...input, members: { create: { userId, role: 'Owner' } } },
    })
  })
  if (ws.status === 'pending') {
    const told = NOTIFY.awaitingApproval()
    await notifyWorkspace(ws.id, 'system', told.title, told.detail, WORKSPACE_PAGE)
  }
  return ws
}

export async function workspaceForUser(userId: string): Promise<Workspace | null> {
  const m = await db.workspaceMember.findFirst({
    where: { userId },
    orderBy: { workspace: { createdAt: 'asc' } },
    include: { workspace: true },
  })
  return m?.workspace ?? null
}

export type WorkspaceUpdate = Partial<WorkspaceInput> & { registrationNumber?: string | null; accountManager?: string }

export async function updateWorkspace(id: string, input: WorkspaceUpdate): Promise<Workspace> {
  return db.workspace.update({ where: { id }, data: input })
}

type Decision = { status: 'approved'; approvedAt: Date; declineReason: null } | { status: 'declined'; declineReason: string }

// Only from `from`: a decision someone already made (or a status that moved on) is refused.
async function decide(tx: Tx, id: string, from: WorkspaceStatus, data: Decision) {
  const { count } = await tx.workspace.updateMany({ where: { id, status: from }, data })
  if (count === 0) throw 'INVALID_TRANSITION'
  return tx.workspace.findUniqueOrThrow({ where: { id } })
}

async function approveFrom(from: 'pending' | 'declined', id: string, byUserId: string, now: Date): Promise<Workspace> {
  const ws = await db.$transaction(async (tx) => {
    const row = await decide(tx, id, from, { status: 'approved', approvedAt: now, declineReason: null })
    await tx.reviewAction.create({ data: { targetType: 'Workspace', targetId: id, action: 'Approve', byUserId, at: now } })
    return row
  })
  await audit(byUserId, 'workspace.approve', { type: 'Workspace', id, workspaceId: id }, { status: from }, { status: 'approved' })
  const told = NOTIFY.workspaceApproved()
  await notifyWorkspace(id, 'approved', told.title, told.detail, WORKSPACE_PAGE)
  return ws
}

// Global's decision on a new advertiser: the status and the decision commit together, then it is audited and
// the workspace's members hear it (GLB §1.6; the prototype told nobody about a decline, D4).
export function approveWorkspace(id: string, byUserId: string, now = new Date()): Promise<Workspace> {
  return approveFrom('pending', id, byUserId, now)
}

// Advertisers › workspace: Global changes its mind about a declined workspace (the reason is cleared).
export function reapproveWorkspace(id: string, byUserId: string, now = new Date()): Promise<Workspace> {
  return approveFrom('declined', id, byUserId, now)
}

export async function declineWorkspace(id: string, byUserId: string, reason: string, now = new Date()): Promise<Workspace> {
  const why = reason.trim()
  if (!why) throw 'REASON_REQUIRED'
  const ws = await db.$transaction(async (tx) => {
    const row = await decide(tx, id, 'pending', { status: 'declined', declineReason: why })
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
