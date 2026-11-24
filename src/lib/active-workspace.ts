import 'server-only'
import type { WorkspaceStatus, WorkspaceType } from '@prisma/client'
import { cookies } from 'next/headers'
import { audit } from '@/lib/audit'
import { db } from '@/lib/db'
import { tileColorAt } from '@/lib/format'
import { isAdminInDb, requireUser, type SessionUser } from '@/lib/session'

export const ACTIVE_WORKSPACE_COOKIE = 'of_ws'

// `demo`: the seed made it (Prompt 9), so its row carries the Demo pill.
export type SwitcherItem = {
  id: string
  name: string
  type: WorkspaceType
  country: string
  status: WorkspaceStatus
  demo: boolean
}

const pick = { id: true, name: true, type: true, country: true, status: true, demo: true } as const
const statusRank: Record<WorkspaceStatus, number> = { approved: 0, pending: 1, declined: 2 }

// The only writer of the cookie: Global may pick any workspace, everyone else only their own.
export async function setActiveWorkspace(id: string): Promise<void> {
  const user = await requireUser()
  const member = await db.workspaceMember.findFirst({
    where: { userId: user.id, workspaceId: id },
    select: { workspaceId: true },
  })
  if (!member) {
    if (!(await isAdminInDb(user.id))) throw 'FORBIDDEN'
    if (!(await db.workspace.findUnique({ where: { id }, select: { id: true } }))) throw 'FORBIDDEN'
    await audit(user.id, 'workspace.enter', { type: 'Workspace', id, workspaceId: id })
  }
  // No maxAge: a session cookie, gone when the browser closes.
  ;(await cookies()).set(ACTIVE_WORKSPACE_COOKIE, id, { httpOnly: true, sameSite: 'lax', path: '/' })
}

export async function clearActiveWorkspace(): Promise<void> {
  ;(await cookies()).delete(ACTIVE_WORKSPACE_COOKIE)
}

export async function readActiveWorkspaceId(): Promise<string | undefined> {
  return (await cookies()).get(ACTIVE_WORKSPACE_COOKIE)?.value
}

// The tile colour of one workspace in the list (the sidebar's head, the Workspace page).
export const tileOf = (items: SwitcherItem[], id: string): string => tileColorAt(items.findIndex((w) => w.id === id))

export async function listSwitcher(user: Pick<SessionUser, 'id'>): Promise<SwitcherItem[]> {
  if (await isAdminInDb(user.id)) {
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
