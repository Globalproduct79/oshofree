import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { copyInviteLink, InviteLinkField } from '@/app/app/(console)/people/InviteLink'
import { InviteRowView, resendRow, revokeRow } from '@/app/app/(console)/people/InvitesList'
import PeoplePage from '@/app/app/(console)/people/page'
import { getToast, takeToast } from '@/components/shell/toast-store'
import {
  changeRoleAction, inviteAction, removeMemberAction, resendInviteAction, revokeInviteAction,
} from '@/app/app/(console)/people/actions'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { fd } from '@/lib/format'
import { acceptInvite, inviteUrl } from '@/lib/invitations'

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
    await expect(resendInviteAction('x')).rejects.toBe('FORBIDDEN')
  })

  it('a Viewer cannot resend: the token stays and no link comes back', async () => {
    const { owner, ws, actor } = await setup('Manager')
    await db.workspaceMember.update({ where: { userId_workspaceId: { userId: actor.id, workspaceId: ws.id } }, data: { role: 'Viewer' } })
    const inv = await db.invitation.create({
      data: { workspaceId: ws.id, email: 'p@x.test', role: 'Viewer', token: 'c0ffee'.repeat(5) + 'ab', invitedById: owner.id, expiresAt: new Date(Date.now() + 1e8) },
    })
    await expect(resendInviteAction(inv.id)).rejects.toBe('FORBIDDEN')
    await expect(inviteAction('n@x.test', 'Viewer')).rejects.toBe('FORBIDDEN')
    await expect(revokeInviteAction(inv.id)).rejects.toBe('FORBIDDEN')
    expect((await db.invitation.findUniqueOrThrow({ where: { id: inv.id } })).token).toBe(inv.token)
    expect(await db.auditEvent.count({ where: { action: 'invite.resend' } })).toBe(0)
  })

  it('an Owner invites, changes a role, revokes and removes', async () => {
    const { ws } = await setup('Owner')
    const sent = await inviteAction('n@x.test', 'Manager')
    const inv = await db.invitation.findFirstOrThrow({ where: { workspaceId: ws.id } })
    // The new invite's link goes back to the inviter who made it, and to no one else.
    expect(sent).toEqual({
      ok: true, url: inviteUrl(inv.token), id: inv.id, email: 'n@x.test', role: 'Manager', expires: fd(inv.expiresAt, 'Africa/Lagos'),
    })
    expect(inv.role).toBe('Manager')
    expect(await db.auditEvent.count({ where: { action: 'member.invite' } })).toBe(1)
    expect(await revokeInviteAction(inv.id)).toEqual({})
    expect((await db.invitation.findUniqueOrThrow({ where: { id: inv.id } })).revokedAt).not.toBeNull()
    const m = await db.user.create({ data: { email: 'm@x.test', name: 'M', passwordHash: 'x' } })
    await db.workspaceMember.create({ data: { userId: m.id, workspaceId: ws.id, role: 'Viewer' } })
    expect(await changeRoleAction(m.id, 'Manager')).toEqual({})
    expect((await db.workspaceMember.findFirstOrThrow({ where: { userId: m.id } })).role).toBe('Manager')
    expect(await removeMemberAction(m.id)).toEqual({})
    expect(await db.workspaceMember.count({ where: { userId: m.id } })).toBe(0)
  })

  it('Resend hands the one who clicked a new link, and the old one stops working', async () => {
    const { ws } = await setup('Owner')
    const sent = await inviteAction('n@x.test', 'Manager')
    if (!('ok' in sent)) throw new Error('invite failed')
    const again = await resendInviteAction(sent.id)
    const inv = await db.invitation.findUniqueOrThrow({ where: { id: sent.id } })
    expect(again).toEqual({ ok: true, link: inviteUrl(inv.token), expires: fd(inv.expiresAt, 'Africa/Lagos') })
    expect('ok' in again && again.link).not.toBe(sent.url)
    expect(await db.invitation.findFirst({ where: { token: sent.url.split('/invite/')[1] } })).toBeNull()
    const ev = await db.auditEvent.findFirstOrThrow({ where: { action: 'invite.resend', workspaceId: ws.id } })
    expect(ev.after).toEqual({ email: 'n@x.test', role: 'Manager' })
  })

  it('Resend of an invite already accepted or revoked says so instead of making a link', async () => {
    await setup('Owner')
    const sent = await inviteAction('n@x.test', 'Viewer')
    if (!('ok' in sent)) throw new Error('invite failed')
    await revokeInviteAction(sent.id)
    expect(await resendInviteAction(sent.id)).toEqual({ error: 'GONE' })
  })

  it('Revoke or Resend of an invite no longer open, or not in this workspace, says GONE and changes nothing', async () => {
    const { ws, owner } = await setup('Owner')
    const revoked = await inviteAction('r@x.test', 'Viewer')
    const joined = await inviteAction('j@x.test', 'Viewer')
    if (!('ok' in revoked) || !('ok' in joined)) throw new Error('invite failed')
    expect(await revokeInviteAction(revoked.id)).toEqual({})
    expect(await revokeInviteAction(revoked.id)).toEqual({ error: 'GONE' })
    const u = await db.user.create({ data: { email: 'j@x.test', name: 'J', passwordHash: 'x' } })
    await acceptInvite(joined.url.split('/invite/')[1], u)
    expect(await revokeInviteAction(joined.id)).toEqual({ error: 'GONE' })
    expect(await resendInviteAction(joined.id)).toEqual({ error: 'GONE' })
    expect((await db.invitation.findUniqueOrThrow({ where: { id: joined.id } })).revokedAt).toBeNull()
    // Another workspace's invite, as when the active workspace changed in another tab.
    const other = await db.workspace.create({ data: { name: 'Other', type: 'Brand', country: 'NG', status: 'approved' } })
    const theirs = await db.invitation.create({
      data: { workspaceId: other.id, email: 'p@x.test', role: 'Viewer', token: 'c0ffee'.repeat(5) + 'ab', invitedById: owner.id, expiresAt: new Date(Date.now() + 1e8) },
    })
    expect(await resendInviteAction(theirs.id)).toEqual({ error: 'GONE' })
    expect(await revokeInviteAction(theirs.id)).toEqual({ error: 'GONE' })
    expect(await resendInviteAction('missing')).toEqual({ error: 'GONE' })
    expect(await db.invitation.findUniqueOrThrow({ where: { id: theirs.id } })).toMatchObject({ token: theirs.token, revokedAt: null })
    expect(await db.auditEvent.count({ where: { action: { in: ['invite.resend', 'invite.revoke'] }, workspaceId: { not: ws.id } } })).toBe(0)
  })

  it('Global can resend', async () => {
    const { ws, owner } = await setup('Global')
    const inv = await db.invitation.create({
      data: { workspaceId: ws.id, email: 'p@x.test', role: 'Viewer', token: 'c0ffee'.repeat(5) + 'ab', invitedById: owner.id, expiresAt: new Date(Date.now() - 1000) },
    })
    expect(await resendInviteAction(inv.id)).toEqual({ ok: true, link: expect.stringMatching(/\/invite\/[0-9a-f]{32}$/), expires: expect.any(String) })
  })

  it('Global can invite', async () => {
    await setup('Global')
    expect(await inviteAction('n@x.test', 'Viewer')).toMatchObject({ ok: true, url: expect.stringMatching(/\/invite\/[0-9a-f]{32}$/) })
  })

  it('invalid email and existing member are errors, the last Owner is protected', async () => {
    const { owner } = await setup('Owner')
    expect(await inviteAction('nope', 'Manager')).toEqual({ error: 'INVALID_EMAIL' })
    expect(await inviteAction('o@x.test', 'Manager')).toEqual({ error: 'ALREADY_MEMBER' })
    expect(await changeRoleAction(owner.id, 'Viewer')).toEqual({ error: 'LAST_OWNER' })
    expect(await removeMemberAction(owner.id)).toEqual({ error: 'LAST_OWNER' })
  })

  it('the page lists members, the role table and a pending row with Resend and Revoke, and ships no link', async () => {
    const { ws } = await setup('Owner')
    await inviteAction('new@x.test', 'Manager')
    const inv = await db.invitation.findFirstOrThrow({ where: { workspaceId: ws.id } })
    const tree = await PeoplePage()
    expect(JSON.stringify(tree)).not.toContain(inv.token)
    const html = renderToStaticMarkup(tree)
    expect(html).not.toContain(inv.token)
    expect(html).not.toContain('/invite/')
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    expect(text).toContain('Tunde Okafor')
    expect(text).toContain(`new@x.test Manager · invited by Tunde Okafor · expires ${fd(inv.expiresAt, 'Africa/Lagos')} Resend Revoke`)
    expect(text).toContain('Everything, including invoices, credit and people')
    expect(text).toContain('Create, submit, edit, pause campaigns; see reports')
    expect(text).toContain('Reports and invoices, read-only')
    expect(html).toContain('title="The last Owner can&#x27;t be demoted."')
  })

  it.each(['Manager', 'Viewer'] as const)('a %s gets no token, link, select or controls', async (role) => {
    const { owner, ws, actor } = await setup('Manager')
    await db.workspaceMember.update({ where: { userId_workspaceId: { userId: actor.id, workspaceId: ws.id } }, data: { role } })
    const inv = await db.invitation.create({
      data: { workspaceId: ws.id, email: 'p@x.test', role: 'Owner', token: 'c0ffee'.repeat(5) + 'ab', invitedById: owner.id, expiresAt: new Date(Date.now() + 1e8) },
    })
    const tree = await PeoplePage()
    const props = JSON.stringify(tree)
    expect(props).not.toContain(inv.token)
    expect(props).not.toContain('/invite/')
    const html = renderToStaticMarkup(tree)
    expect(html).not.toContain(inv.token)
    expect(html).not.toContain('<select')
    expect(html).toContain('Owner · invited by Tunde Okafor')
    expect(html).not.toContain('Resend')
    expect(html).not.toContain('>Copy<')
    expect(html).not.toContain('Revoke')
    expect(html).not.toContain('>Remove<')
    expect(html).not.toContain('Send invite')
  })
})

// One invite's row on People and the invite page: what a Resend or Revoke answer does to it.
describe('an invite row', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    takeToast()
  })
  const row = { id: 'i1', email: 'n@x.test', role: 'Manager' as const, invitedBy: 'Tunde Okafor', expires: '21 Nov', expired: false }
  const view = (state: Parameters<typeof InviteRowView>[0]['state'], canManage = true) => {
    const html = renderToStaticMarkup(createElement(InviteRowView, { invite: row, canManage, state, busy: false, onResend: () => {}, onRevoke: () => {} }))
    return { html, text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }
  }

  it('Resend shows the new link and says the old one stopped working; the toast carries no link', async () => {
    const { ws } = await setup('Owner')
    const sent = await inviteAction('n@x.test', 'Manager')
    if (!('ok' in sent)) throw new Error('invite failed')
    takeToast()
    const next = await resendRow(sent.id)
    const inv = await db.invitation.findUniqueOrThrow({ where: { id: sent.id } })
    expect(next).toEqual({ status: 'open', fresh: { link: inviteUrl(inv.token), expires: fd(inv.expiresAt, 'Africa/Lagos') } })
    expect(takeToast()?.message).toBe('New link made. The old one no longer works.')
    expect(ws.id).toBeTruthy()
  })

  it('Revoke ends the row as revoked, without a toast', async () => {
    await setup('Owner')
    const sent = await inviteAction('n@x.test', 'Manager')
    if (!('ok' in sent)) throw new Error('invite failed')
    takeToast()
    expect(await revokeRow(sent.id)).toEqual({ status: 'revoked' })
    expect(getToast()).toBeNull()
  })

  it.each([['Resend', resendRow], ['Revoke', revokeRow]] as const)(
    '%s of an invite someone has already taken up ends the row as gone and says so',
    async (_, act) => {
      await setup('Owner')
      const sent = await inviteAction('n@x.test', 'Manager')
      if (!('ok' in sent)) throw new Error('invite failed')
      const u = await db.user.create({ data: { email: 'n@x.test', name: 'N', passwordHash: 'x' } })
      await acceptInvite(sent.url.split('/invite/')[1], u)
      takeToast()
      expect(await act(sent.id)).toEqual({ status: 'gone' })
      expect(takeToast()?.message).toBe('That invite was already accepted or revoked.')
    },
  )

  it('an open row has its date, Resend and Revoke, and a link only after its own Send or Resend', () => {
    expect(view({ status: 'open', fresh: null }).text).toBe('N n@x.test Manager · invited by Tunde Okafor · expires 21 Nov Resend Revoke')
    const fresh = view({ status: 'open', fresh: { link: 'http://x/invite/abc', expires: '28 Nov' } })
    expect(fresh.text).toBe('N n@x.test Manager · invited by Tunde Okafor · expires 28 Nov Resend Revoke Link Copy')
    expect(fresh.html).toContain('value="http://x/invite/abc"')
    expect(view({ status: 'open', fresh: null }, false).text).toBe('N n@x.test Manager · invited by Tunde Okafor · expires 21 Nov')
  })

  it('a revoked row and a gone row are final: no date, no buttons, no link', () => {
    const revoked = view({ status: 'revoked' })
    expect(revoked.text).toBe('N n@x.test Manager · invited by Tunde Okafor · revoked, the link no longer works')
    const gone = view({ status: 'gone' })
    expect(gone.text).toBe('N n@x.test Manager · invited by Tunde Okafor · already accepted or revoked')
    for (const r of [revoked, gone]) {
      expect(r.html).not.toContain('<button')
      expect(r.html).not.toContain('<input')
      expect(r.text).not.toContain('expires')
    }
  })
})

// An invite link is a bearer credential: a toast outlives the page that raised it, so the link never goes in one.
describe('copying an invite link', () => {
  const url = 'http://localhost:3101/invite/c0ffeec0ffeec0ffeec0ffeec0ffeeab'
  const refused = async () => {
    throw new Error('NotAllowedError')
  }

  it('says it was copied, without the link', async () => {
    takeToast()
    const written: string[] = []
    expect(await copyInviteLink(url, async (t) => void written.push(t))).toBe(true)
    expect(written).toEqual([url])
    expect(takeToast()?.message).toBe('Invite link copied')
  })

  it('when the browser refuses, toasts nothing: the link stays in its field to copy by hand', async () => {
    takeToast()
    expect(await copyInviteLink(url, refused)).toBe(false)
    expect(getToast()).toBeNull()
  })

  it('shows the link in a read-only field with Copy', () => {
    const html = renderToStaticMarkup(createElement(InviteLinkField, { url }))
    const field = html.match(/<input[^>]*>/)?.[0] ?? ''
    expect(field).toMatch(/readonly=""/i)
    expect(field).toContain(`value="${url}"`)
    expect(html).toMatch(/<button[^>]*>Copy<\/button>/)
  })
})
