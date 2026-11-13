import 'server-only'
import type { BellItem } from '@/components/shell/BellPanel'
import { SHELL } from '@/lib/copy-shell'
import { db } from '@/lib/db'
import { ageLabel, initials } from '@/lib/format'
import type { NavCounts } from '@/lib/nav'
import { listNotifications, unreadCount } from '@/lib/notifications'
import pkg from '../../package.json'

// What the two layouts load for the shell: nav counts, the bell, the Owner's initials, the version.

export const APP_VERSION = SHELL.version(pkg.version)

const RUNNING = ['live', 'paused', 'review', 'scheduled'] as const

// Campaigns and Invoices are this workspace's; Review is platform-wide, so only Global gets it.
export async function navCounts(workspaceId: string | null, isGlobal: boolean): Promise<NavCounts> {
  const zero = Promise.resolve(0)
  const [campaigns, invoices, reviewCampaigns, pendingWorkspaces] = await Promise.all([
    workspaceId ? db.campaign.count({ where: { workspaceId, status: { in: [...RUNNING] } } }) : zero,
    // A due invoice past its date is overdue (derived), and counts too.
    workspaceId ? db.invoice.count({ where: { workspaceId, status: 'due' } }) : zero,
    isGlobal ? db.campaign.count({ where: { status: 'review' } }) : zero,
    isGlobal ? db.workspace.count({ where: { status: 'pending' } }) : zero,
  ])
  return { campaigns, invoices, review: reviewCampaigns + pendingWorkspaces }
}

// workspaceId null = Global's own notifications (in Platform and inside a workspace alike).
export async function bellFor(
  userId: string,
  workspaceId: string | null,
  now = new Date(),
): Promise<{ unread: number; items: BellItem[] }> {
  const [unread, rows] = await Promise.all([unreadCount(userId, workspaceId), listNotifications(userId, workspaceId, 20)])
  return {
    unread,
    items: rows.map((n) => ({ id: n.id, title: n.title, detail: n.detail, href: n.href, age: ageLabel(n.createdAt, now) })),
  }
}

// The topbar avatar: the workspace's first Owner. Memberships carry no join date, so the
// earliest-created Owner account stands in for "first to join".
export async function ownerInitials(workspaceId: string): Promise<string | null> {
  const owner = await db.workspaceMember.findFirst({
    where: { workspaceId, role: 'Owner' },
    orderBy: { user: { createdAt: 'asc' } },
    select: { user: { select: { name: true } } },
  })
  return owner ? initials(owner.user.name) : null
}
