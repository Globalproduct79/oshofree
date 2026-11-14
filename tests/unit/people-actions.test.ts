import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PeoplePage from '@/app/app/(console)/people/page'
import { changeRoleAction, inviteAction, removeMemberAction, revokeInviteAction } from '@/app/app/(console)/people/actions'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

vi.mock('@/lib/auth', () => ({ auth: vi.fn(), signOut: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const jar = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => jar }))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

async function setup(role: 'Owner' | 'Manager' | 'Global') {
  const owner = await db.user.create({ data: { email: 'o@x.test', name: 'Tunde Okafor', passwordHash: 'x' } })
  const ws = await db.workspace.create({ data: { name: 'Kola Bright', type: 'Brand', country: 'NG', status: 'approved' } })
  await db.workspaceMember.create({ data: { userId: owner.id, workspaceId: ws.id, role: 'Owner' } })
  let actor = owner
  if (role !== 'Owner') {
    const isGlobalAdmin = role === 'Global'
    actor = await db.user.create({ data: { email: 'a@x.test', name: 'Ada', passwordHash: 'x', isGlobalAdmin } })
    if (!isGlobalAdmin) await db.workspaceMember.create({ data: { userId: actor.id, workspaceId: ws.id, role: 'Manager' } })
  }
  vi.mocked(auth).mockResolvedValue({ user: { id: actor.id, isGlobalAdmin: role === 'Global' }, expires: '' } as never)
  jar.get.mockImplementation((k: string) => (k === 'of_ws' ? { value: ws.id } : undefined))
  return { owner, ws, actor }
}

describe('people actions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('a Manager is refused everything', async () => {
    const { owner } = await setup('Manager')
    await expect(inviteAction('n@x.test', 'Viewer')).rejects.toBe('FORBIDDEN')
    await expect(changeRoleAction(owner.id, 'Viewer')).rejects.toBe('FORBIDDEN')
    await expect(removeMemberAction(owner.id)).rejects.toBe('FORBIDDEN')
    await expect(revokeInviteAction('x')).rejects.toBe('FORBIDDEN')
  })

  it('an Owner invites, changes a role, revokes and removes', async () => {
    const { ws } = await setup('Owner')
    expect(await inviteAction('n@x.test', 'Manager')).toEqual({ ok: true })
    const inv = await db.invitation.findFirstOrThrow({ where: { workspaceId: ws.id } })
    expect(inv.role).toBe('Manager')
    expect(await db.auditEvent.count({ where: { action: 'member.invite' } })).toBe(1)
    await revokeInviteAction(inv.id)
    expect((await db.invitation.findUniqueOrThrow({ where: { id: inv.id } })).revokedAt).not.toBeNull()
    const m = await db.user.create({ data: { email: 'm@x.test', name: 'M', passwordHash: 'x' } })
    await db.workspaceMember.create({ data: { userId: m.id, workspaceId: ws.id, role: 'Viewer' } })
    expect(await changeRoleAction(m.id, 'Manager')).toEqual({})
    expect((await db.workspaceMember.findFirstOrThrow({ where: { userId: m.id } })).role).toBe('Manager')
    expect(await removeMemberAction(m.id)).toEqual({})
    expect(await db.workspaceMember.count({ where: { userId: m.id } })).toBe(0)
  })

  it('Global can invite', async () => {
    await setup('Global')
    expect(await inviteAction('n@x.test', 'Viewer')).toEqual({ ok: true })
  })

  it('invalid email and existing member are errors, the last Owner is protected', async () => {
    const { owner } = await setup('Owner')
    expect(await inviteAction('nope', 'Manager')).toEqual({ error: 'INVALID_EMAIL' })
    expect(await inviteAction('o@x.test', 'Manager')).toEqual({ error: 'ALREADY_MEMBER' })
    expect(await changeRoleAction(owner.id, 'Viewer')).toEqual({ error: 'LAST_OWNER' })
    expect(await removeMemberAction(owner.id)).toEqual({ error: 'LAST_OWNER' })
  })

  it('the page lists members, the role table and a pending row', async () => {
    await setup('Owner')
    await inviteAction('new@x.test', 'Manager')
    const html = renderToStaticMarkup(await PeoplePage())
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    expect(text).toContain('Tunde Okafor')
    expect(text).toContain('Invited · Manager')
    expect(text).toContain('Copy invite link')
    expect(text).toContain('Revoke')
    expect(text).toContain('Everything, including invoices, credit and people')
    expect(text).toContain('Create, submit, edit, pause campaigns; see reports')
    expect(text).toContain('Reports and invoices, read-only')
    expect(html).toContain('title="The last Owner can&#x27;t be demoted."')
  })
})
