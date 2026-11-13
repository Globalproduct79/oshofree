import { SetupChecklist } from '@/components/console/SetupChecklist'
import { Banner, type BannerKind } from '@/components/shell/Banner'
import { Sidebar } from '@/components/shell/Sidebar'
import { Toaster } from '@/components/shell/Toast'
import { TopBar } from '@/components/shell/TopBar'
import { listSwitcher } from '@/lib/active-workspace'
import { COPY } from '@/lib/copy'
import { SHELL } from '@/lib/copy-shell'
import { initials } from '@/lib/format'
import { MARKETS } from '@/lib/markets'
import { navFor } from '@/lib/nav'
import { requireMember } from '@/lib/permissions'
import { APP_VERSION, bellFor, navCounts, ownerInitials } from '@/lib/shell'
import { setupChecklist } from '@/lib/workspaces'

// The workspace shell. The member is resolved once here; Global inside a workspace keeps its own
// avatar and bell, gets the PLATFORM group and a banner with the way back (spec §6.1).
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { user, workspace, role } = await requireMember('view')
  const isGlobal = role === 'Global'
  const [checklist, counts, bell, switcher, owner] = await Promise.all([
    setupChecklist(workspace.id),
    navCounts(workspace.id, isGlobal),
    bellFor(user.id, isGlobal ? null : workspace.id),
    listSwitcher(user),
    isGlobal ? null : ownerInitials(workspace.id),
  ])
  const items = [
    { label: COPY.setup.workspace, done: checklist.workspace },
    { label: COPY.setup.firstCampaign, done: checklist.firstCampaign },
    { label: COPY.setup.approvedCampaign, done: checklist.approvedCampaign },
    { label: COPY.setup.firstShare, done: checklist.firstShare },
  ]
  const banner: BannerKind | null = isGlobal
    ? 'globalInside'
    : workspace.status === 'pending'
      ? 'pending'
      : workspace.status === 'declined'
        ? 'declined'
        : null
  return (
    <div className="min-h-screen min-[981px]:grid min-[981px]:grid-cols-[var(--sb)_minmax(0,1fr)]">
      <Sidebar
        brand={{
          initials: initials(workspace.name),
          name: workspace.name,
          sub: SHELL.brand.workspaceSub(workspace.type, MARKETS[workspace.country].name),
          tile: 'ink',
        }}
        groups={navFor({ role, inWorkspace: true, counts })}
        footer={APP_VERSION}
      >
        <SetupChecklist items={items} />
      </Sidebar>
      <div className="main">
        <TopBar
          unread={bell.unread}
          notifications={bell.items}
          switcher={{ items: switcher, currentId: workspace.id, currentName: workspace.name }}
          avatar={isGlobal ? SHELL.switcher.globalAvatar : (owner ?? initials(user.name))}
          isGlobal={user.isGlobalAdmin}
        />
        {banner && <Banner kind={banner} workspaceName={workspace.name} reason={workspace.declineReason} />}
        <main className="wrap">{children}</main>
      </div>
      <Toaster />
    </div>
  )
}
