import type { NotificationKind } from '@prisma/client'
import { db } from '@/lib/db'

export const NOTIFICATION_KINDS: NotificationKind[] = ['approved', 'credit', 'pace', 'ended', 'weekly', 'review', 'system']
const defaultOn = (kind: NotificationKind) => kind !== 'weekly'

export async function notifyWorkspace(
  workspaceId: string, kind: NotificationKind, title: string, detail?: string, href?: string,
): Promise<void> {
  const [members, prefs] = await Promise.all([
    db.workspaceMember.findMany({ where: { workspaceId }, select: { userId: true } }),
    db.notificationPref.findMany({ where: { workspaceId, kind } }),
  ])
  const off = new Map(prefs.map((p) => [p.userId, p.enabled]))
  const rows = members
    .filter((m) => off.get(m.userId) ?? defaultOn(kind))
    .map((m) => ({ userId: m.userId, workspaceId, kind, title, detail, href }))
  if (rows.length) await db.notification.createMany({ data: rows })
}

export async function notifyGlobal(kind: NotificationKind, title: string, detail?: string, href?: string): Promise<void> {
  const admins = await db.user.findMany({ where: { isGlobalAdmin: true }, select: { id: true } })
  if (admins.length) {
    await db.notification.createMany({
      data: admins.map((a) => ({ userId: a.id, workspaceId: null, kind, title, detail, href })),
    })
  }
}

export const unreadCount = (userId: string, workspaceId: string | null) =>
  db.notification.count({ where: { userId, workspaceId, readAt: null } })

export const listNotifications = (userId: string, workspaceId: string | null, limit = 20) =>
  db.notification.findMany({ where: { userId, workspaceId }, orderBy: { createdAt: 'desc' }, take: limit })

export async function markRead(id: string, userId: string): Promise<void> {
  await db.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } })
}

export async function getPrefs(userId: string, workspaceId: string): Promise<Record<NotificationKind, boolean>> {
  const rows = await db.notificationPref.findMany({ where: { userId, workspaceId } })
  const out = {} as Record<NotificationKind, boolean>
  for (const k of NOTIFICATION_KINDS) out[k] = defaultOn(k)
  for (const r of rows) out[r.kind] = r.enabled
  return out
}

export async function setPref(userId: string, workspaceId: string, kind: NotificationKind, enabled: boolean): Promise<void> {
  await db.notificationPref.upsert({
    where: { userId_workspaceId_kind: { userId, workspaceId, kind } },
    create: { userId, workspaceId, kind, enabled },
    update: { enabled },
  })
}
