import { Banner } from '@/components/shell/Banner'
import { Palette } from '@/components/shell/Palette'
import { Sidebar } from '@/components/shell/Sidebar'
import { Toaster } from '@/components/shell/Toast'
import { TopBar } from '@/components/shell/TopBar'
import { listSwitcher } from '@/lib/active-workspace'
import { SHELL } from '@/lib/copy-shell'
import { navFor } from '@/lib/nav'
import { requireAdmin } from '@/lib/session'
import { APP_VERSION, bellFor, navCounts } from '@/lib/shell'

// The Platform shell, and the gate for every /admin page: a signed-in non-admin gets a 404.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin()
  const [counts, bell, switcher] = await Promise.all([navCounts(null, true), bellFor(user.id, null), listSwitcher(user)])
  return (
    <div className="shell min-h-screen min-[981px]:grid min-[981px]:grid-cols-[var(--sb)_minmax(0,1fr)]">
      <Sidebar
        brand={{ initials: SHELL.brand.tile, name: SHELL.brand.product, sub: SHELL.brand.platform }}
        groups={navFor({ role: 'Global', inWorkspace: false, counts })}
        footer={APP_VERSION}
      />
      <div className="main">
        <TopBar
          unread={bell.unread}
          notifications={bell.items}
          switcher={{ items: switcher, currentId: null }}
          account={{ name: user.name, email: user.email, where: SHELL.account.platform }}
          avatar={SHELL.account.globalAvatar}
          isGlobal
        />
        <Banner kind="global" />
        <main className="wrap">{children}</main>
      </div>
      <Palette mode="platform" />
      <Toaster />
    </div>
  )
}
