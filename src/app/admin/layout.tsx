import { Sidebar } from '@/components/console/Sidebar'
import { TopBar } from '@/components/console/TopBar'
import { COPY } from '@/lib/copy'
import { requireAdmin } from '@/lib/session'
import { tokens } from '@/lib/tokens'

const groups = [
  { label: COPY.admin.platform, items: [
    { label: COPY.admin.review, href: '/admin/review' },
    { label: COPY.admin.advertisers, href: '/admin/advertisers' },
    { label: COPY.admin.api, href: '/admin/api' },
  ] },
]

// The gate for every /admin page: a signed-in non-admin gets a 404.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin()
  return (
    <div
      className="min-h-screen min-[980px]:pl-[var(--sidebar-w)]"
      style={{ ['--sidebar-w' as string]: tokens.sidebar, backgroundColor: tokens.bg }}
    >
      <Sidebar groups={groups} />
      <TopBar workspaceName={COPY.admin.global} userName={user.name} />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">{children}</main>
    </div>
  )
}
