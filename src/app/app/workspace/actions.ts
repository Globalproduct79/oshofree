'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { COPY } from '@/lib/copy'
import { requireUser } from '@/lib/session'
import { workspaceSchema } from '@/lib/workspace-schema'
import { requireWorkspace, updateWorkspace } from '@/lib/workspaces'
import type { FormState } from '../workspace-form'

export async function updateWorkspaceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser()
  const ws = await requireWorkspace() // the client never names the workspace
  const owner = await db.workspaceMember.findFirst({
    where: { workspaceId: ws.id, userId: user.id, role: 'Owner' },
    select: { userId: true },
  })
  if (!owner) return { error: COPY.workspace.ownerOnly }
  const parsed = workspaceSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: COPY.workspace.invalid }
  await updateWorkspace(ws.id, parsed.data)
  revalidatePath('/app/workspace')
  return { saved: true }
}
