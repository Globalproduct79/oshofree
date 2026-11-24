import { Banner, type BannerKind } from '@/components/shell/Banner'
import { Palette } from '@/components/shell/Palette'
import { Sidebar } from '@/components/shell/Sidebar'
import { Toaster } from '@/components/shell/Toast'
import { TopBar } from '@/components/shell/TopBar'
import { listSwitcher, tileOf } from '@/lib/active-workspace'
import { SHELL } from '@/lib/copy-shell'
import { initials } from '@/lib/format'
import { MARKETS } from '@/lib/markets'
import { navFor } from '@/lib/nav'
import { requireMember } from '@/lib/permissions'
import { APP_VERSION, bellFor, navCounts } from '@/lib/shell'

// The workspace shell. The member is resolved once here; Global inside a workspace keeps its own
// avatar (GL) and bell and sees the workspace's own sidebar (no PLATFORM group, 17 Nov), with a banner that leads back.
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { user, workspace, role } = await requireMember('view')
  const isGlobal = role === 'Global'
  const [counts, bell, switcher] = await Promise.all([
    navCounts(workspace.id, isGlobal),
    bellFor(user.id, isGlobal ? null : workspace.id),
    listSwitcher(user),
  ])
  const banner: BannerKind | null = isGlobal
    ? 'globalInside'
    : workspace.status === 'pending'
      ? 'pending'
      : workspace.status === 'declined'
        ? 'declined'
        : null
  return (
    <div className="shell min-h-screen min-[981px]:grid min-[981px]:grid-cols-[var(--sb)_minmax(0,1fr)]">
      <Sidebar
        brand={{
          initials: initials(workspace.name),
          name: workspace.name,
          sub: SHELL.brand.workspaceSub(workspace.type, MARKETS[workspace.country].name),
          tile: tileOf(switcher, workspace.id),
          demo: workspace.demo,
        }}
        groups={navFor({ role, inWorkspace: true, counts })}
        footer={APP_VERSION}
      />
      <div className="main">
        <TopBar
          unread={bell.unread}
          notifications={bell.items}
          switcher={{ items: switcher, currentId: workspace.id }}
          account={{ name: user.name, email: user.email, where: SHELL.account.where(role, workspace.name) }}
          avatar={isGlobal ? SHELL.account.globalAvatar : initials(user.name)}
          isGlobal={user.isGlobalAdmin}
        />
        {banner && <Banner kind={banner} workspaceName={workspace.name} reason={workspace.declineReason} />}
        <main className="wrap">{children}</main>
      </div>
      <Palette mode="workspace" />
      <Toaster />
    </div>
  )
}
