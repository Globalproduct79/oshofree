import 'server-only'
import type { Workspace, WorkspaceType } from '@prisma/client'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import type { Country } from '@/lib/markets'
import { isAdminInDb, requireUser } from '@/lib/session'

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

// A Global admin may look at any workspace via the og_ws cookie; nobody else may.
export async function requireWorkspace(): Promise<Workspace> {
  const user = await requireUser()
  if (await isAdminInDb(user.id)) {
    const id = (await cookies()).get('og_ws')?.value
    if (id) {
      const picked = await db.workspace.findUnique({ where: { id } })
      if (picked) return picked
    }
  }
  const ws = await workspaceForUser(user.id)
  if (!ws) redirect('/app/new-workspace')
  return ws
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

// True when the user is looking at a workspace they do not own (a Global admin).
export async function isImpersonating(userId: string, workspaceId: string): Promise<boolean> {
  const m = await db.workspaceMember.findFirst({ where: { userId, workspaceId, role: 'Owner' } })
  return m === null
}
