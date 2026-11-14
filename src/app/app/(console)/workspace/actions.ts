'use server'

import { revalidatePath } from 'next/cache'
import { audit } from '@/lib/audit'
import { COPY } from '@/lib/copy'
import { requireMember } from '@/lib/permissions'
import { workspaceSchema } from '@/lib/workspace-schema'
import { updateWorkspace, type WorkspaceUpdate } from '@/lib/workspaces'
import type { FormState } from '../workspace-form'

const settingsSchema = workspaceSchema.partial({ type: true, country: true })

export async function updateWorkspaceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, workspace: ws, role } = await requireMember('settings') // Owner or Global; the client never names the workspace
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: COPY.workspace.invalid }
  const { type, country, name, registrationNumber } = parsed.data

  // Type and billing country are Global's once the workspace is past pending (spec 6.14.6).
  const open = ws.status === 'pending' || role === 'Global'
  if (!open && ((type && type !== ws.type) || (country && country !== ws.country))) return { error: 'LOCKED' }

  const patch: WorkspaceUpdate = { name, registrationNumber: registrationNumber || null }
  if (open) {
    if (type) patch.type = type
    if (country) patch.country = country
  }
  const next = await updateWorkspace(ws.id, patch)
  const pick = (w: typeof ws) => ({ name: w.name, type: w.type, country: w.country, registrationNumber: w.registrationNumber })
  await audit(user.id, 'workspace.update', { type: 'Workspace', id: ws.id, workspaceId: ws.id }, pick(ws), pick(next))
  revalidatePath('/app/workspace')
  return { saved: true }
}
