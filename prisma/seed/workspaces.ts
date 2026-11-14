import type { NotificationKind, Role, Workspace, WorkspaceType } from '@prisma/client'
import { db } from '@/lib/db'
import type { Country } from '@/lib/markets'
import { setCreditLimit } from '@/lib/money'
import { setPref } from '@/lib/notifications'
import { approveWorkspace, createWorkspace } from '@/lib/workspaces'
import type { Clock, Stamper } from './timeline'
import type { People, PersonKey } from './users'

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000

export type WorkspaceKey = 'kola' | 'media' | 'pesa' | 'sun'

type Spec = {
  key: WorkspaceKey
  name: string
  type: WorkspaceType
  country: Country
  owner: PersonKey
  members: [PersonKey, Role][]
  limitCents: number
  // Days before the run day it joined; null for the one that joined today and still waits for Global.
  joinedDaysAgo: number | null
  // ADV §11: the toggles that differ from the defaults (pace on, weekly off), for every member.
  prefs?: Partial<Record<NotificationKind, boolean>>
}

// ADV §14 and §9: four workspaces, their people, limits and notification toggles.
const WORKSPACES: Spec[] = [
  { key: 'kola', name: 'Kola Bright', type: 'Brand', country: 'NG', owner: 'tunde', members: [['ada', 'Manager']], limitCents: 150000, joinedDaysAgo: 80 },
  {
    key: 'media', name: 'MediaSpec (agency)', type: 'Agency', country: 'NG', owner: 'dolapo',
    members: [['chidi', 'Manager'], ['kemi', 'Viewer']], limitCents: 800000, joinedDaysAgo: 90, prefs: { pace: false, weekly: true },
  },
  { key: 'pesa', name: 'Pesa Link', type: 'Brand', country: 'KE', owner: 'wanjiru', members: [], limitCents: 50000, joinedDaysAgo: 85 },
  { key: 'sun', name: 'SunFresh Juices', type: 'Brand', country: 'GH', owner: 'kofi', members: [], limitCents: 50000, joinedDaysAgo: null },
]

const SUNFRESH_HOURS_AGO = 6

export type Workspaces = Record<WorkspaceKey, Workspace>

async function join(spec: Spec, people: People, joinedAt: Date): Promise<Workspace> {
  const created = await createWorkspace(people[spec.owner].id, { name: spec.name, type: spec.type, country: spec.country })
  // createWorkspace stamps the wall clock; "Since" on the Workspace page reads when it joined.
  const ws = await db.workspace.update({ where: { id: created.id }, data: { createdAt: joinedAt } })
  if (spec.members.length) {
    await db.workspaceMember.createMany({ data: spec.members.map(([who, role]) => ({ userId: people[who].id, workspaceId: ws.id, role })) })
  }
  const everyone = [spec.owner, ...spec.members.map(([who]) => who)]
  for (const [kind, enabled] of Object.entries(spec.prefs ?? {}) as [NotificationKind, boolean][]) {
    for (const who of everyone) await setPref(people[who].id, ws.id, kind, enabled)
  }
  return ws
}

// Three approved workspaces that joined months ago (Global approved each the next day and set its limit), and
// SunFresh, which joined this morning and is waiting for Global.
export async function seedWorkspaces(people: People, clock: Clock, stamp: Stamper): Promise<Workspaces> {
  const out = {} as Workspaces
  const adminId = people.admin.id
  for (const spec of WORKSPACES) {
    if (spec.joinedDaysAgo === null) {
      const joinedAt = clock.hoursAgo(SUNFRESH_HOURS_AGO)
      // createWorkspace tells its owner it is awaiting approval.
      out[spec.key] = await stamp.at(joinedAt, () => join(spec, people, joinedAt))
      continue
    }
    const joinedAt = clock.utc(-spec.joinedDaysAgo, 9)
    const approvedAt = new Date(joinedAt.getTime() + DAY_MS)
    const ws = await stamp.at(joinedAt, () => join(spec, people, joinedAt))
    await stamp.at(approvedAt, () => approveWorkspace(ws.id, adminId, approvedAt))
    if (spec.limitCents !== ws.creditLimitCents) {
      await stamp.at(new Date(approvedAt.getTime() + HOUR_MS), () => setCreditLimit(ws.id, spec.limitCents, adminId))
    }
    out[spec.key] = await db.workspace.findUniqueOrThrow({ where: { id: ws.id } })
  }
  return out
}
