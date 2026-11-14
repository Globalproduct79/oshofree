import { redirect } from 'next/navigation'
import { Box } from '@/components/og'
import { PageHead } from '@/components/shell/PageHead'
import { COPY } from '@/lib/copy'
import { requireUser } from '@/lib/session'
import { workspaceForUser } from '@/lib/workspaces'
import { WorkspaceForm } from '../(console)/workspace-form'
import { createWorkspaceAction } from './actions'

// Before a user has any workspace: the console's head and the form, without the shell (there is no workspace
// to show in it yet). The form's Create workspace is the page's one action.
export default async function NewWorkspacePage() {
  const user = await requireUser()
  if (await workspaceForUser(user.id)) redirect('/app/workspace')
  return (
    <main className="wrap">
      <PageHead crumb={[{ label: COPY.workspace.newCrumb }]} title={COPY.workspace.newTitle} lead={COPY.workspace.newLead} />
      <Box>
        <WorkspaceForm action={createWorkspaceAction} submitLabel={COPY.workspace.createAction} />
      </Box>
    </main>
  )
}
