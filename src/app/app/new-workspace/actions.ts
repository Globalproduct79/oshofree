'use server'

import { redirect } from 'next/navigation'
import { COPY } from '@/lib/copy'
import { requireUser } from '@/lib/session'
import { workspaceSchema } from '@/lib/workspace-schema'
import { createWorkspace } from '@/lib/workspaces'
import type { FormState } from '../(console)/workspace-form'

export async function createWorkspaceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser()
  const parsed = workspaceSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: COPY.workspace.invalid }
  try {
    await createWorkspace(user.id, parsed.data)
  } catch (e) {
    if (e !== 'ALREADY_HAS_WORKSPACE') throw e
  }
  // Its home, under the awaiting-approval banner the whole workspace sees until Global decides.
  redirect('/app')
}
