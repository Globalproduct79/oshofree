import { PageHead } from '@/components/console/PageHead'
import { COPY } from '@/lib/copy'
import { requireWorkspace } from '@/lib/workspaces'
import { WorkspaceForm } from '../workspace-form'
import { updateWorkspaceAction } from './actions'

export default async function WorkspacePage() {
  const ws = await requireWorkspace()
  return (
    <div className="max-w-xl">
      <PageHead title={COPY.page.workspace.title} subtitle={COPY.page.workspace.subtitle} />
      <WorkspaceForm
        action={updateWorkspaceAction}
        submitLabel={COPY.workspace.saveAction}
        initial={{ name: ws.name, type: ws.type, country: ws.country }}
      />
    </div>
  )
}
