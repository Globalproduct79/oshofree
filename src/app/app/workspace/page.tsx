import { COPY } from '@/lib/copy'
import { requireWorkspace } from '@/lib/workspaces'
import { WorkspaceForm } from '../workspace-form'
import { updateWorkspaceAction } from './actions'

export default async function WorkspacePage() {
  const ws = await requireWorkspace()
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      {ws.status === 'pending' && (
        <p role="status" className="rounded-lg border border-border bg-muted p-3 text-sm">
          {COPY.workspace.pendingBanner}
        </p>
      )}
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{COPY.workspace.title}</h1>
        <p className="text-sm text-muted-foreground">{COPY.workspace.subtitle}</p>
      </header>
      <WorkspaceForm
        action={updateWorkspaceAction}
        submitLabel={COPY.workspace.saveAction}
        initial={{ name: ws.name, type: ws.type, country: ws.country }}
      />
    </main>
  )
}
