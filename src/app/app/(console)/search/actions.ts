'use server'

import { requireMember } from '@/lib/permissions'
import { searchWorkspace, type WorkspaceSearch } from '@/lib/search'

// Every role may search its own workspace.
export async function searchAction(q: string): Promise<WorkspaceSearch> {
  const { workspace } = await requireMember('view')
  return searchWorkspace(workspace.id, q)
}
