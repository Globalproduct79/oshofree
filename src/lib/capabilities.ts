// Who may do what in a workspace (spec §6.2). Pure, so the sidebar's nav (which the client also imports) can ask
// the same question the server's requireMember does; permissions.ts re-exports it.
import type { Role } from '@prisma/client'

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
