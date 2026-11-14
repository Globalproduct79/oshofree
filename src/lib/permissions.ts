import 'server-only'
import type { Role, Workspace } from '@prisma/client'
import { redirect } from 'next/navigation'
import { readActiveWorkspaceId } from '@/lib/active-workspace'
import { db } from '@/lib/db'
import { isAdminInDb, requireUser, type SessionUser } from '@/lib/session'

export type Capability = 'view' | 'campaigns' | 'rewards' | 'billing' | 'requestCredit' | 'people' | 'settings'
export type MemberRole = Role | 'Global'

const OWNER_GLOBAL: MemberRole[] = ['Owner', 'Global']
const TABLE: Record<Capability, MemberRole[] | 'all'> = {
  view: 'all',
  campaigns: ['Owner', 'Manager', 'Global'],
  rewards: ['Owner', 'Manager', 'Global'],
  billing: 'all',
  requestCredit: OWNER_GLOBAL,
  people: OWNER_GLOBAL,
  settings: OWNER_GLOBAL,
}

export function can(role: MemberRole, cap: Capability): boolean {
  const allowed = TABLE[cap]
  return allowed === 'all' || allowed.includes(role)
}

export type Member = { user: SessionUser; workspace: Workspace; role: MemberRole }

export async function requireMember(cap: Capability): Promise<Member> {
  const user = await requireUser()
  const admin = await isAdminInDb(user.id)
  const wanted = await readActiveWorkspaceId()
  let found: { workspace: Workspace; role: MemberRole } | null = null

  if (wanted) {
    if (admin) {
      const workspace = await db.workspace.findUnique({ where: { id: wanted } })
      if (workspace) found = { workspace, role: 'Global' }
    }
    if (!found) {
      // A cookie for a workspace the user is not in is ignored.
      const m = await db.workspaceMember.findFirst({
        where: { userId: user.id, workspaceId: wanted },
        include: { workspace: true },
      })
      if (m) found = { workspace: m.workspace, role: m.role }
    }
  }
  if (!found) {
    const m = await db.workspaceMember.findFirst({
      where: { userId: user.id },
      orderBy: { workspace: { createdAt: 'asc' } },
      include: { workspace: true },
    })
    if (m) found = { workspace: m.workspace, role: m.role }
  }
  if (!found) redirect(admin ? '/admin/review' : '/app/new-workspace')
  if (!can(found.role, cap)) throw 'FORBIDDEN'
  return { user: { ...user, isGlobalAdmin: admin }, workspace: found.workspace, role: found.role }
}

// The active workspace for any signed-in member (see requireMember).
export async function requireWorkspace(): Promise<Workspace> {
  return (await requireMember('view')).workspace
}
