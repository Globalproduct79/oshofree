import 'server-only'
import type { WorkspaceStatus, WorkspaceType } from '@prisma/client'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { isAdminInDb, requireUser, type SessionUser } from '@/lib/session'

export const ACTIVE_WORKSPACE_COOKIE = 'of_ws'

export type SwitcherItem = { id: string; name: string; type: WorkspaceType; country: string; status: WorkspaceStatus }

const pick = { id: true, name: true, type: true, country: true, status: true } as const
const statusRank: Record<WorkspaceStatus, number> = { approved: 0, pending: 1, declined: 2 }

// The only writer of the cookie: Global may pick any workspace, everyone else only their own.
export async function setActiveWorkspace(id: string): Promise<void> {
  const user = await requireUser()
  const allowed = (await isAdminInDb(user.id))
    ? await db.workspace.findUnique({ where: { id }, select: { id: true } })
    : await db.workspaceMember.findFirst({ where: { userId: user.id, workspaceId: id }, select: { workspaceId: true } })
  if (!allowed) throw 'FORBIDDEN'
  // No maxAge: a session cookie, gone when the browser closes.
  ;(await cookies()).set(ACTIVE_WORKSPACE_COOKIE, id, { httpOnly: true, sameSite: 'lax', path: '/' })
}

export async function clearActiveWorkspace(): Promise<void> {
  ;(await cookies()).delete(ACTIVE_WORKSPACE_COOKIE)
}

export async function readActiveWorkspaceId(): Promise<string | undefined> {
  return (await cookies()).get(ACTIVE_WORKSPACE_COOKIE)?.value
}

export async function listSwitcher(user: Pick<SessionUser, 'id'> & { isGlobalAdmin?: boolean }): Promise<SwitcherItem[]> {
  if (user.isGlobalAdmin ?? (await isAdminInDb(user.id))) {
    const all = await db.workspace.findMany({ select: pick, orderBy: { name: 'asc' } })
    return all.sort((a, b) => statusRank[a.status] - statusRank[b.status])
  }
  const rows = await db.workspaceMember.findMany({
    where: { userId: user.id },
    orderBy: { workspace: { createdAt: 'asc' } },
    select: { workspace: { select: pick } },
  })
  return rows.map((r) => r.workspace)
}
