import { redirect } from 'next/navigation'
import { signOutAction } from '@/app/app/(console)/switch/actions'
import { AuthFrame } from '@/components/auth/AuthFrame'
import { SubmitButton } from '@/components/og'
import { PageHead } from '@/components/shell/PageHead'
import { COPY } from '@/lib/copy'
import { SHELL } from '@/lib/copy-shell'
import { requireUser } from '@/lib/session'
import { workspaceForUser } from '@/lib/workspaces'
import { WorkspaceForm } from '../(console)/workspace-form'
import { createWorkspaceAction } from './actions'

// Before a user has any workspace: the step after sign-up, in the onboarding column (17 Nov) — the head and the form
// on one card, without the shell (there is no workspace to show in it yet). The form's Create workspace is the page's
// one action; the head's white Sign out is the way off it for someone who has no workspace (a new sign-up, or a member
// removed from their only one) — Prompt 10.
export default async function NewWorkspacePage() {
  const user = await requireUser()
  if (await workspaceForUser(user.id)) redirect('/app/workspace')
  return (
    <AuthFrame>
      <div className="box wide">
        <PageHead
          crumb={[{ label: COPY.workspace.newCrumb }]}
          title={COPY.workspace.newTitle}
          lead={COPY.workspace.newLead}
          actions={
            <form action={signOutAction}>
              <SubmitButton variant="ghost">{SHELL.switcher.signOut}</SubmitButton>
            </form>
          }
        />
        <WorkspaceForm action={createWorkspaceAction} submitLabel={COPY.workspace.createAction} />
      </div>
    </AuthFrame>
  )
}
