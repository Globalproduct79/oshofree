import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listSwitcher, setActiveWorkspace } from '@/lib/active-workspace'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { can, requireMember } from '@/lib/permissions'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
const jar = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => jar }))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`)
  },
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
}))

const mkUser = (email: string, isGlobalAdmin = false) =>
  db.user.create({ data: { email, name: 'N', passwordHash: 'x', isGlobalAdmin } })
const mkWs = (name: string, status: 'approved' | 'pending' | 'declined' = 'approved') =>
  db.workspace.create({ data: { name, type: 'Brand', country: 'NG', status } })
const join = (userId: string, workspaceId: string, role: 'Owner' | 'Manager' | 'Viewer') =>
  db.workspaceMember.create({ data: { userId, workspaceId, role } })
const signIn = (u: { id: string; isGlobalAdmin?: boolean }, cookie?: string) => {
  vi.mocked(auth).mockResolvedValue({ user: { id: u.id, isGlobalAdmin: !!u.isGlobalAdmin }, expires: '' } as never)
  jar.get.mockImplementation((k: string) => (k === 'of_ws' && cookie ? { value: cookie } : undefined))
}

beforeEach(() => vi.clearAllMocks())

describe('can', () => {
  it('follows the permission table', () => {
    expect(can('Viewer', 'campaigns')).toBe(false)
    expect(can('Viewer', 'view')).toBe(true)
    expect(can('Viewer', 'billing')).toBe(true)
    expect(can('Manager', 'people')).toBe(false)
    expect(can('Manager', 'rewards')).toBe(true)
    expect(can('Manager', 'requestCredit')).toBe(false)
    expect(can('Owner', 'settings')).toBe(true)
    expect(can('Global', 'people')).toBe(true)
  })
})

describe('requireMember', () => {
  it('refuses a Viewer for campaigns with FORBIDDEN, but lets them view', async () => {
    const u = await mkUser('v@x.com')
    const ws = await mkWs('A')
    await join(u.id, ws.id, 'Viewer')
    signIn(u)
    await expect(requireMember('campaigns')).rejects.toBe('FORBIDDEN')
    expect((await requireMember('view')).role).toBe('Viewer')
  })

  it('lets Global pick any workspace through of_ws, with role Global', async () => {
    const g = await mkUser('g@x.com', true)
    const ws = await mkWs('Other')
    signIn(g, ws.id)
    const m = await requireMember('people')
    expect(m.workspace.id).toBe(ws.id)
    expect(m.role).toBe('Global')
  })

  it('ignores a forged of_ws and falls back to the first membership', async () => {
    const u = await mkUser('o@x.com')
    const mine = await mkWs('Mine')
    const theirs = await mkWs('Theirs')
    await join(u.id, mine.id, 'Owner')
    signIn(u, theirs.id)
    expect((await requireMember('view')).workspace.id).toBe(mine.id)
  })

  it('honours of_ws for a workspace the user is a member of', async () => {
    const u = await mkUser('o@x.com')
    const first = await mkWs('First')
    const second = await mkWs('Second')
    await join(u.id, first.id, 'Owner')
    await join(u.id, second.id, 'Manager')
    signIn(u, second.id)
    const m = await requireMember('view')
    expect([m.workspace.id, m.role]).toEqual([second.id, 'Manager'])
  })

  it('redirects a member-less user to /app/new-workspace, and Global to /admin/review', async () => {
    const u = await mkUser('n@x.com')
    signIn(u)
    await expect(requireMember('view')).rejects.toThrow('REDIRECT:/app/new-workspace')
    const g = await mkUser('g@x.com', true)
    signIn(g)
    await expect(requireMember('view')).rejects.toThrow('REDIRECT:/admin/review')
  })
})

describe('active workspace', () => {
  it('sets the cookie for a member and for Global, refuses anyone else', async () => {
    const u = await mkUser('o@x.com')
    const g = await mkUser('g@x.com', true)
    const mine = await mkWs('Mine')
    const other = await mkWs('Other')
    await join(u.id, mine.id, 'Owner')
    signIn(u)
    await setActiveWorkspace(mine.id)
    expect(jar.set).toHaveBeenCalledWith('of_ws', mine.id, { httpOnly: true, sameSite: 'lax', path: '/' })
    await expect(setActiveWorkspace(other.id)).rejects.toBe('FORBIDDEN')
    signIn(g)
    await setActiveWorkspace(other.id)
    expect(jar.set).toHaveBeenLastCalledWith('of_ws', other.id, expect.anything())
    const events = await db.auditEvent.findMany()
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ actorId: g.id, action: 'workspace.enter', targetType: 'Workspace', targetId: other.id, workspaceId: other.id })
  })

  it('lists a member their workspaces oldest first, and Global all by status then name', async () => {
    const u = await mkUser('o@x.com')
    const g = await mkUser('g@x.com', true)
    const b = await mkWs('B')
    const a = await mkWs('A')
    const p = await mkWs('Aardvark', 'pending')
    const d = await mkWs('Zed', 'declined')
    await join(u.id, b.id, 'Owner')
    await join(u.id, a.id, 'Viewer')
    expect((await listSwitcher(u)).map((w) => w.name)).toEqual(['B', 'A'])
    expect(Object.keys((await listSwitcher(u))[0]).sort()).toEqual(['country', 'id', 'name', 'status', 'type'])
    expect((await listSwitcher(g)).map((w) => w.id)).toEqual([a.id, b.id, p.id, d.id])
  })
})

describe('a demoted Global with a stale JWT', () => {
  it('is treated as a plain member everywhere', async () => {
    const u = await mkUser('d@x.com', false)
    const mine = await mkWs('Mine')
    const foreign = await mkWs('Foreign')
    await join(u.id, mine.id, 'Manager')
    signIn({ id: u.id, isGlobalAdmin: true }, foreign.id)
    const m = await requireMember('view')
    expect([m.workspace.id, m.role, m.user.isGlobalAdmin]).toEqual([mine.id, 'Manager', false])
    await expect(setActiveWorkspace(foreign.id)).rejects.toBe('FORBIDDEN')
    expect((await listSwitcher({ id: u.id })).map((w) => w.id)).toEqual([mine.id])
    expect(await db.auditEvent.count()).toBe(0)
  })
})
