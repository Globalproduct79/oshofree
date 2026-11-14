import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { markReadAction, setPrefAction } from '@/app/app/(console)/notifications/actions'
import NotificationsPage from '@/app/app/(console)/notifications/page'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { getPrefs } from '@/lib/notifications'
import { getToast, takeToast, toast } from '@/components/shell/toast-store'

vi.mock('@/lib/auth', () => ({ auth: vi.fn(), signOut: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const jar = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => jar }))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

async function setup(role: 'Owner' | 'Manager') {
  const owner = await db.user.create({ data: { email: 'o@x.test', name: 'Tunde', passwordHash: 'x' } })
  const ws = await db.workspace.create({ data: { name: 'Kola Bright', type: 'Brand', country: 'NG', status: 'approved' } })
  await db.workspaceMember.create({ data: { userId: owner.id, workspaceId: ws.id, role: 'Owner' } })
  let actor = owner
  if (role === 'Manager') {
    actor = await db.user.create({ data: { email: 'm@x.test', name: 'Ada', passwordHash: 'x' } })
    await db.workspaceMember.create({ data: { userId: actor.id, workspaceId: ws.id, role: 'Manager' } })
  }
  vi.mocked(auth).mockResolvedValue({ user: { id: actor.id, isGlobalAdmin: false }, expires: '' } as never)
  jar.get.mockImplementation((k: string) => (k === 'of_ws' ? { value: ws.id } : undefined))
  return { owner, actor, ws }
}

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('notification prefs', () => {
  beforeEach(() => vi.clearAllMocks())

  it('an Owner toggle persists for that user and workspace only', async () => {
    const { owner, ws } = await setup('Owner')
    await setPrefAction('weekly', true)
    await setPrefAction('pace', false)
    expect(await getPrefs(owner.id, ws.id)).toMatchObject({ weekly: true, pace: false, approved: true })
    const other = await db.workspace.create({ data: { name: 'Other', type: 'Brand', country: 'NG', status: 'approved' } })
    expect((await getPrefs(owner.id, other.id)).pace).toBe(true)
  })

  it('a Manager is refused', async () => {
    await setup('Manager')
    await expect(setPrefAction('pace', false)).rejects.toBe('FORBIDDEN')
  })

  it('an unknown kind is rejected', async () => {
    await setup('Owner')
    await expect(setPrefAction('system', false)).rejects.toBe('INVALID_KIND')
  })

  it('the page shows the five rows and the Recent items newest first, disabled for a Manager', async () => {
    const { actor, ws } = await setup('Manager')
    const now = Date.now()
    await db.notification.createMany({
      data: [
        { userId: actor.id, workspaceId: ws.id, kind: 'pace', title: 'Older one', detail: 'some detail', createdAt: new Date(now - 26 * 3_600_000) },
        { userId: actor.id, workspaceId: ws.id, kind: 'pace', title: 'Newer one', createdAt: new Date(now - 2 * 3_600_000) },
      ],
    })
    const html = renderToStaticMarkup(await NotificationsPage())
    const t = text(html)
    for (const l of ['Campaign approved or rejected', 'Credit limit reached or invoice due', 'Budget finishing early or late', 'Campaign ended', 'Weekly digest', 'Email and in-app', 'Recent', 'What we tell you, and where.'])
      expect(t).toContain(l)
    expect(t.indexOf('Newer one')).toBeLessThan(t.indexOf('Older one'))
    expect(t).toContain('Newer one 2h ago')
    expect(t).toContain('Older one some detail · 1d ago')
    expect(html.match(/role="switch"[^>]*disabled/g)).toHaveLength(5)
  })

  it('an empty Recent says Nothing new.', async () => {
    await setup('Owner')
    expect(text(renderToStaticMarkup(await NotificationsPage()))).toContain('Nothing new.')
  })
})

describe('markReadAction', () => {
  it('marks only the signed-in user’s own row', async () => {
    const { owner, actor } = await setup('Manager')
    const mine = await db.notification.create({ data: { userId: actor.id, workspaceId: null, kind: 'system', title: 'a' } })
    const theirs = await db.notification.create({ data: { userId: owner.id, workspaceId: null, kind: 'system', title: 'b' } })
    await markReadAction(theirs.id)
    expect((await db.notification.findUniqueOrThrow({ where: { id: theirs.id } })).readAt).toBeNull()
    await markReadAction(mine.id)
    expect((await db.notification.findUniqueOrThrow({ where: { id: mine.id } })).readAt).not.toBeNull()
  })
})

describe('toast store', () => {
  it('a toast is taken once; a Toaster mounting later finds nothing', () => {
    toast('x')
    expect(getToast()?.message).toBe('x')
    expect(takeToast()?.message).toBe('x')
    expect(getToast()).toBeNull()
    expect(takeToast()).toBeNull()
  })
})
