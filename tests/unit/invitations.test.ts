import { describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import {
  acceptInvite, changeRole, findInvite, invite, inviteUrl, members, openInvites, removeMember, resendInvite, revokeInvite,
} from '@/lib/invitations'

const mkUser = (email: string, name = email) => db.user.create({ data: { email, name, passwordHash: 'x' } })
async function setup() {
  const owner = await mkUser('o@x.test', 'Owner One')
  const ws = await db.workspace.create({ data: { name: 'Kola', type: 'Brand', country: 'NG', status: 'approved' } })
  await db.workspaceMember.create({ data: { userId: owner.id, workspaceId: ws.id, role: 'Owner' } })
  return { owner, ws }
}

describe('invitations', () => {
  it('rejects a bad email', async () => {
    const { owner, ws } = await setup()
    await expect(invite(ws.id, owner.id, 'nope', 'Manager')).rejects.toBe('INVALID_EMAIL')
  })

  it('makes a 32-hex token valid for 7 days and a link', async () => {
    const { owner, ws } = await setup()
    const inv = await invite(ws.id, owner.id, 'New@X.test', 'Manager')
    expect(inv.token).toMatch(/^[0-9a-f]{32}$/)
    expect(inv.email).toBe('new@x.test')
    const days = (inv.expiresAt.getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(6.99)
    expect(days).toBeLessThanOrEqual(7)
    expect(inviteUrl(inv.token)).toMatch(new RegExp(`/invite/${inv.token}$`))
  })

  it('refuses an existing member', async () => {
    const { owner, ws } = await setup()
    await expect(invite(ws.id, owner.id, 'o@x.test', 'Viewer')).rejects.toBe('ALREADY_MEMBER')
  })

  it('a second invite replaces the first token', async () => {
    const { owner, ws } = await setup()
    const a = await invite(ws.id, owner.id, 'n@x.test', 'Manager')
    const b = await invite(ws.id, owner.id, 'n@x.test', 'Viewer')
    expect(a.token).not.toBe(b.token)
    expect((await openInvites(ws.id)).map((p) => p.id)).toEqual([b.id])
    await expect(acceptInvite(a.token, { id: 'u', email: 'n@x.test' })).rejects.toBe('INVALID')
  })

  it('accept joins with the invited role and marks it accepted', async () => {
    const { owner, ws } = await setup()
    const inv = await invite(ws.id, owner.id, 'n@x.test', 'Viewer')
    const u = await mkUser('n@x.test', 'Newbie')
    expect(await acceptInvite(inv.token, u)).toEqual({ workspaceId: ws.id, role: 'Viewer' })
    const m = await db.workspaceMember.findFirstOrThrow({ where: { userId: u.id, workspaceId: ws.id } })
    expect(m.role).toBe('Viewer')
    expect(await openInvites(ws.id)).toHaveLength(0)
    await expect(acceptInvite(inv.token, u)).rejects.toBe('INVALID')
  })

  it('an existing member just marks it accepted, keeping their role', async () => {
    const { owner, ws } = await setup()
    // Created while the person was not yet a member, then they joined another way.
    const inv = await db.invitation.create({
      data: { workspaceId: ws.id, email: 'o@x.test', role: 'Viewer', token: 'a'.repeat(32), invitedById: owner.id, expiresAt: new Date(Date.now() + 1e6) },
    })
    await acceptInvite(inv.token, owner)
    expect((await db.workspaceMember.findFirstOrThrow({ where: { userId: owner.id } })).role).toBe('Owner')
  })

  it('an expired token is refused', async () => {
    const { owner, ws } = await setup()
    const inv = await invite(ws.id, owner.id, 'n@x.test', 'Manager')
    await db.invitation.update({ where: { id: inv.id }, data: { expiresAt: new Date(Date.now() - 1000) } })
    await expect(acceptInvite(inv.token, { id: 'u', email: 'n@x.test' })).rejects.toBe('EXPIRED')
    // Still listed, as expired, for Resend to revive.
    expect((await openInvites(ws.id)).map((p) => p.id)).toEqual([inv.id])
  })

  it('a revoked token is refused', async () => {
    const { owner, ws } = await setup()
    const inv = await invite(ws.id, owner.id, 'n@x.test', 'Manager')
    expect(await revokeInvite(inv.id, owner.id)).toBe(true)
    await expect(acceptInvite(inv.token, { id: 'u', email: 'n@x.test' })).rejects.toBe('INVALID')
    await expect(revokeInvite(inv.id, owner.id, 'other-ws')).rejects.toBe('NOT_FOUND')
  })

  it('revoking says whether it revoked: an invite already revoked or accepted is left alone and not audited again', async () => {
    const { owner, ws } = await setup()
    const inv = await invite(ws.id, owner.id, 'n@x.test', 'Manager')
    expect(await revokeInvite(inv.id, owner.id, ws.id)).toBe(true)
    const revokedAt = (await db.invitation.findUniqueOrThrow({ where: { id: inv.id } })).revokedAt
    expect(await revokeInvite(inv.id, owner.id, ws.id)).toBe(false)
    expect((await db.invitation.findUniqueOrThrow({ where: { id: inv.id } })).revokedAt).toEqual(revokedAt)
    const joined = await invite(ws.id, owner.id, 'j@x.test', 'Viewer')
    await acceptInvite(joined.token, await mkUser('j@x.test'))
    expect(await revokeInvite(joined.id, owner.id, ws.id)).toBe(false)
    expect((await db.invitation.findUniqueOrThrow({ where: { id: joined.id } })).revokedAt).toBeNull()
    await expect(revokeInvite('missing', owner.id, ws.id)).rejects.toBe('NOT_FOUND')
    expect(await db.auditEvent.count({ where: { action: 'invite.revoke' } })).toBe(1)
  })

  it('refuses to demote or remove the only Owner, allows it with two', async () => {
    const { owner, ws } = await setup()
    await expect(changeRole(ws.id, owner.id, 'Manager', owner.id)).rejects.toBe('LAST_OWNER')
    await expect(removeMember(ws.id, owner.id, owner.id)).rejects.toBe('LAST_OWNER')
    const two = await mkUser('t@x.test', 'Two')
    await db.workspaceMember.create({ data: { userId: two.id, workspaceId: ws.id, role: 'Manager' } })
    await changeRole(ws.id, two.id, 'Owner', owner.id)
    await changeRole(ws.id, owner.id, 'Viewer', two.id)
    expect((await members(ws.id)).map((m) => [m.name, m.role, m.isLastOwner])).toEqual([
      ['Owner One', 'Viewer', false],
      ['Two', 'Owner', true],
    ])
    await removeMember(ws.id, owner.id, two.id)
    expect(await members(ws.id)).toHaveLength(1)
    expect(await db.auditEvent.count({ where: { action: { in: ['member.role', 'member.remove'] } } })).toBe(3)
  })
})

describe('invitations: concurrency and audit', () => {
  it('two concurrent accepts of one token, by different users, give one success and one membership', async () => {
    const { owner, ws } = await setup()
    const inv = await invite(ws.id, owner.id, 'n@x.test', 'Manager')
    const u1 = await mkUser('u1@x.test', 'U1')
    const u2 = await mkUser('u2@x.test', 'U2')
    const r = await Promise.allSettled([acceptInvite(inv.token, u1), acceptInvite(inv.token, u2)])
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
    expect(r.find((x) => x.status === 'rejected')).toMatchObject({ reason: 'INVALID' })
    expect(await db.workspaceMember.count({ where: { workspaceId: ws.id, userId: { in: [u1.id, u2.id] } } })).toBe(1)
  })

  it('two Owners demoting each other concurrently leave one Owner', async () => {
    const { owner, ws } = await setup()
    const two = await mkUser('t@x.test', 'Two')
    await db.workspaceMember.create({ data: { userId: two.id, workspaceId: ws.id, role: 'Owner' } })
    const r = await Promise.allSettled([
      changeRole(ws.id, owner.id, 'Viewer', two.id),
      changeRole(ws.id, two.id, 'Viewer', owner.id),
    ])
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
    expect(r.find((x) => x.status === 'rejected')).toMatchObject({ reason: 'LAST_OWNER' })
    expect(await db.workspaceMember.count({ where: { workspaceId: ws.id, role: 'Owner' } })).toBe(1)
  })

  it('accepting audits member.join with both emails', async () => {
    const { owner, ws } = await setup()
    const inv = await invite(ws.id, owner.id, 'n@x.test', 'Viewer')
    const u = await mkUser('other@x.test', 'Other')
    await acceptInvite(inv.token, u)
    const ev = await db.auditEvent.findFirstOrThrow({ where: { action: 'member.join' } })
    expect(ev.actorId).toBe(u.id)
    expect(ev.after).toEqual({ invitedEmail: 'n@x.test', acceptedEmail: 'other@x.test', role: 'Viewer' })
  })
})

describe('resendInvite', () => {
  const days = (d: Date) => (d.getTime() - Date.now()) / 86_400_000

  it('gives the invite a new link for another 7 days; the old link stops working and the new one joins', async () => {
    const { owner, ws } = await setup()
    const inv = await invite(ws.id, owner.id, 'n@x.test', 'Manager')
    await db.invitation.update({ where: { id: inv.id }, data: { expiresAt: new Date(Date.now() + 86_400_000) } })
    const again = await resendInvite(inv.id, owner.id, ws.id)
    expect(again.id).toBe(inv.id)
    expect(again.token).toMatch(/^[0-9a-f]{32}$/)
    expect(again.token).not.toBe(inv.token)
    expect(days(again.expiresAt)).toBeGreaterThan(6.99)
    expect(days(again.expiresAt)).toBeLessThanOrEqual(7)
    expect(await findInvite(inv.token)).toBeNull()
    await expect(acceptInvite(inv.token, { id: 'u', email: 'n@x.test' })).rejects.toBe('INVALID')
    const u = await mkUser('n@x.test', 'Newbie')
    expect(await acceptInvite(again.token, u)).toEqual({ workspaceId: ws.id, role: 'Manager' })
  })

  it('a link Resend retired is refused even when it was looked up just before the resend', async () => {
    const { owner, ws } = await setup()
    const inv = await invite(ws.id, owner.id, 'n@x.test', 'Manager')
    const u = await mkUser('n@x.test', 'Newbie')
    // acceptInvite finds the invite by the old token, then Resend lands before its claim.
    const find = db.invitation.findUnique.bind(db.invitation)
    const spy = vi.spyOn(db.invitation, 'findUnique').mockImplementationOnce((async (args: Parameters<typeof find>[0]) => {
      const found = await find(args)
      await resendInvite(inv.id, owner.id, ws.id)
      return found
    }) as never)
    try {
      await expect(acceptInvite(inv.token, u)).rejects.toBe('INVALID')
    } finally {
      spy.mockRestore()
    }
    expect(await db.workspaceMember.count({ where: { userId: u.id, workspaceId: ws.id } })).toBe(0)
    const now = await db.invitation.findUniqueOrThrow({ where: { id: inv.id } })
    expect(now.acceptedAt).toBeNull()
    expect(now.token).not.toBe(inv.token)
    expect(await acceptInvite(now.token, u)).toEqual({ workspaceId: ws.id, role: 'Manager' })
  })

  it('revives an expired invite', async () => {
    const { owner, ws } = await setup()
    const inv = await invite(ws.id, owner.id, 'n@x.test', 'Viewer')
    await db.invitation.update({ where: { id: inv.id }, data: { expiresAt: new Date(Date.now() - 1000) } })
    await expect(acceptInvite(inv.token, { id: 'u', email: 'n@x.test' })).rejects.toBe('EXPIRED')
    const again = await resendInvite(inv.id, owner.id, ws.id)
    expect(days(again.expiresAt)).toBeGreaterThan(6.99)
    expect((await openInvites(ws.id)).map((p) => [p.id, p.expiresAt])).toEqual([[inv.id, again.expiresAt]])
    const u = await mkUser('n@x.test', 'Newbie')
    expect(await acceptInvite(again.token, u)).toEqual({ workspaceId: ws.id, role: 'Viewer' })
  })

  it('refuses an accepted or revoked invite, and one from another workspace, leaving the token alone', async () => {
    const { owner, ws } = await setup()
    const accepted = await invite(ws.id, owner.id, 'a@x.test', 'Viewer')
    await acceptInvite(accepted.token, await mkUser('a@x.test'))
    await expect(resendInvite(accepted.id, owner.id, ws.id)).rejects.toBe('NOT_PENDING')
    const revoked = await invite(ws.id, owner.id, 'r@x.test', 'Viewer')
    await revokeInvite(revoked.id, owner.id, ws.id)
    await expect(resendInvite(revoked.id, owner.id, ws.id)).rejects.toBe('NOT_PENDING')
    const open = await invite(ws.id, owner.id, 'o2@x.test', 'Viewer')
    await expect(resendInvite(open.id, owner.id, 'other-ws')).rejects.toBe('NOT_FOUND')
    await expect(resendInvite('missing', owner.id, ws.id)).rejects.toBe('NOT_FOUND')
    for (const i of [accepted, revoked, open]) {
      expect((await db.invitation.findUniqueOrThrow({ where: { id: i.id } })).token).toBe(i.token)
    }
    expect(await db.auditEvent.count({ where: { action: 'invite.resend' } })).toBe(0)
  })

  it('audits invite.resend with the address and role, never a token', async () => {
    const { owner, ws } = await setup()
    const inv = await invite(ws.id, owner.id, 'n@x.test', 'Manager')
    const again = await resendInvite(inv.id, owner.id, ws.id)
    const ev = await db.auditEvent.findFirstOrThrow({ where: { action: 'invite.resend' } })
    expect(ev).toMatchObject({ actorId: owner.id, targetType: 'Invitation', targetId: inv.id, workspaceId: ws.id })
    expect(ev.after).toEqual({ email: 'n@x.test', role: 'Manager' })
    expect(ev.before).toBeNull()
    const row = JSON.stringify(ev)
    expect(row).not.toContain(inv.token)
    expect(row).not.toContain(again.token)
  })
})

describe('openInvites', () => {
  it('lists invites not yet accepted or revoked, expired ones too, with who sent each and no token', async () => {
    const { owner, ws } = await setup()
    const live = await invite(ws.id, owner.id, 'live@x.test', 'Manager')
    const old = await invite(ws.id, owner.id, 'old@x.test', 'Viewer')
    await db.invitation.update({ where: { id: old.id }, data: { expiresAt: new Date(Date.now() - 1000) } })
    const gone = await invite(ws.id, owner.id, 'gone@x.test', 'Viewer')
    await revokeInvite(gone.id, owner.id, ws.id)
    const joined = await invite(ws.id, owner.id, 'joined@x.test', 'Viewer')
    await acceptInvite(joined.token, await mkUser('joined@x.test'))
    const other = await db.workspace.create({ data: { name: 'Other', type: 'Brand', country: 'NG' } })
    await invite(other.id, owner.id, 'elsewhere@x.test', 'Viewer')

    const rows = await openInvites(ws.id)
    expect(rows).toEqual([
      { id: old.id, email: 'old@x.test', role: 'Viewer', invitedBy: 'Owner One', expiresAt: expect.any(Date) },
      { id: live.id, email: 'live@x.test', role: 'Manager', invitedBy: 'Owner One', expiresAt: live.expiresAt },
    ])
    expect(JSON.stringify(rows)).not.toContain(live.token)
  })
})
