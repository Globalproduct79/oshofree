import { ImpersonationBanner } from '@/components/console/ImpersonationBanner'
import { SetupChecklist } from '@/components/console/SetupChecklist'
import { Sidebar } from '@/components/console/Sidebar'
import { TopBar } from '@/components/console/TopBar'
import { COPY } from '@/lib/copy'
import { requireUser } from '@/lib/session'
import { tokens } from '@/lib/tokens'
import { isImpersonating, requireWorkspace, setupChecklist } from '@/lib/workspaces'

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const workspace = await requireWorkspace()
  const [checklist, impersonating] = await Promise.all([
    setupChecklist(workspace.id),
    isImpersonating(user.id, workspace.id),
  ])
  const items = [
    { label: COPY.setup.workspace, done: checklist.workspace },
    { label: COPY.setup.firstCampaign, done: checklist.firstCampaign },
    { label: COPY.setup.approvedCampaign, done: checklist.approvedCampaign },
    { label: COPY.setup.firstShare, done: checklist.firstShare },
  ]
  return (
    <div
      className="min-h-screen min-[980px]:pl-[var(--sidebar-w)]"
      style={{ ['--sidebar-w' as string]: tokens.sidebar, backgroundColor: tokens.bg }}
    >
      <Sidebar>
        <SetupChecklist items={items} />
      </Sidebar>
      {impersonating && <ImpersonationBanner workspaceName={workspace.name} />}
      <TopBar workspaceName={workspace.name} userName={user.name} />
      {workspace.status === 'pending' && (
        <p
          role="status"
          className="border-b px-4 py-3 text-sm sm:px-8"
          style={{ backgroundColor: tokens.amberSoft, borderColor: tokens.line, color: tokens.amber }}
        >
          {COPY.banner.pending}
        </p>
      )}
      {workspace.status === 'declined' && (
        <p
          role="status"
          className="border-b px-4 py-3 text-sm sm:px-8"
          style={{ backgroundColor: tokens.redSoft, borderColor: tokens.line, color: tokens.red }}
        >
          {COPY.banner.declined(workspace.declineReason)}
        </p>
      )}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">{children}</main>
    </div>
  )
}
