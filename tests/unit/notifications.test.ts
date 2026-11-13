import { describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { getPrefs, listNotifications, markRead, notifyGlobal, notifyWorkspace, setPref, unreadCount } from '@/lib/notifications'
import { NOTIFY } from '@/lib/copy-notifications'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

const mkUser = (email: string, isGlobalAdmin = false) =>
  db.user.create({ data: { email, name: 'N', passwordHash: 'x', isGlobalAdmin } })
async function setup() {
  const ws = await db.workspace.create({ data: { name: 'A', type: 'Brand', country: 'NG' } })
  const a = await mkUser('a@x.com')
  const b = await mkUser('b@x.com')
  await db.workspaceMember.createMany({
    data: [{ userId: a.id, workspaceId: ws.id, role: 'Owner' }, { userId: b.id, workspaceId: ws.id, role: 'Viewer' }],
  })
  return { ws, a, b }
}

describe('notifications', () => {
  it('notifies every member, skipping one who turned the kind off', async () => {
    const { ws, a, b } = await setup()
    await setPref(b.id, ws.id, 'credit', false)
    await notifyWorkspace(ws.id, 'credit', 'T', 'D', '/x')
    expect(await unreadCount(a.id, ws.id)).toBe(1)
    expect(await unreadCount(b.id, ws.id)).toBe(0)
    expect((await listNotifications(a.id, ws.id))[0]).toMatchObject({ title: 'T', detail: 'D', href: '/x' })
  })

  it('defaults every kind on except weekly', async () => {
    const { ws, a } = await setup()
    await notifyWorkspace(ws.id, 'weekly', 'W')
    expect(await unreadCount(a.id, ws.id)).toBe(0)
    expect(await getPrefs(a.id, ws.id)).toEqual({
      approved: true, credit: true, pace: true, ended: true, weekly: false, review: true, system: true,
    })
    await setPref(a.id, ws.id, 'weekly', true)
    await setPref(a.id, ws.id, 'weekly', true)
    expect((await getPrefs(a.id, ws.id)).weekly).toBe(true)
    await notifyWorkspace(ws.id, 'weekly', 'W')
    expect(await unreadCount(a.id, ws.id)).toBe(1)
  })

  it('notifies each Global user with a null workspace', async () => {
    const g1 = await mkUser('g1@x.com', true)
    await mkUser('g2@x.com', true)
    const u = await mkUser('u@x.com')
    await notifyGlobal('review', 'R')
    expect(await db.notification.count({ where: { workspaceId: null } })).toBe(2)
    expect(await unreadCount(g1.id, null)).toBe(1)
    expect(await unreadCount(u.id, null)).toBe(0)
  })

  it('lists newest first and limits', async () => {
    const { ws, a } = await setup()
    for (const t of ['one', 'two', 'three']) {
      await notifyWorkspace(ws.id, 'system', t)
      await new Promise((r) => setTimeout(r, 5))
    }
    expect((await listNotifications(a.id, ws.id, 2)).map((n) => n.title)).toEqual(['three', 'two'])
  })

  it('markRead marks the owner’s row and ignores another user’s', async () => {
    const { ws, a, b } = await setup()
    await notifyWorkspace(ws.id, 'system', 'S')
    const row = (await listNotifications(a.id, ws.id))[0]
    await markRead(row.id, b.id)
    expect(await unreadCount(a.id, ws.id)).toBe(1)
    await markRead(row.id, a.id)
    expect(await unreadCount(a.id, ws.id)).toBe(0)
  })
})

describe('copy-notifications', () => {
  it('matches the inventory strings', () => {
    expect(NOTIFY.inReview('X')).toEqual({ title: 'X is in review', detail: 'Global usually decides within one working day' })
    expect(NOTIFY.scheduled('X', new Date('2026-11-07T00:00:00Z')).title).toBe('X is scheduled for 7 Nov')
    expect(NOTIFY.creditLimit(150000).title).toBe('Your credit limit is now $1,500')
    expect(NOTIFY.ended('X', 57600, '6.1%').detail).toBe('57.6k impressions · 6.1% open rate')
    expect(NOTIFY.ended('X', 0, '', true).detail).toBe('budget fully delivered')
    expect(NOTIFY.pausedOverCredit('X').title).toBe('X paused — credit limit reached')
    expect(NOTIFY.wantsToJoin('S', 'Brand')).toEqual({ title: 'S wants to join', detail: 'New brand workspace' })
    expect(NOTIFY.needsReview('C', 'W')).toEqual({ title: 'C needs review', detail: 'W' })
  })
})
