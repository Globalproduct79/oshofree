import { redirect } from 'next/navigation'
import { COPY } from '@/lib/copy'
import { requireUser } from '@/lib/session'
import { workspaceForUser } from '@/lib/workspaces'
import { WorkspaceForm } from '../workspace-form'
import { createWorkspaceAction } from './actions'

export default async function NewWorkspacePage() {
  const user = await requireUser()
  if (await workspaceForUser(user.id)) redirect('/app/workspace')
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{COPY.workspace.newTitle}</h1>
        <p className="text-sm text-muted-foreground">{COPY.workspace.newSubtitle}</p>
      </header>
      <WorkspaceForm action={createWorkspaceAction} submitLabel={COPY.workspace.createAction} />
    </main>
  )
}
