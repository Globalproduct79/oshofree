import { describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { acceptInvite, changeRole, invite, inviteUrl, members, pendingInvites, removeMember, revokeInvite } from '@/lib/invitations'

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
    expect((await pendingInvites(ws.id)).map((p) => p.id)).toEqual([b.id])
    await expect(acceptInvite(a.token, { id: 'u', email: 'n@x.test' })).rejects.toBe('INVALID')
  })

  it('accept joins with the invited role and marks it accepted', async () => {
    const { owner, ws } = await setup()
    const inv = await invite(ws.id, owner.id, 'n@x.test', 'Viewer')
    const u = await mkUser('n@x.test', 'Newbie')
    expect(await acceptInvite(inv.token, u)).toEqual({ workspaceId: ws.id, role: 'Viewer' })
    const m = await db.workspaceMember.findFirstOrThrow({ where: { userId: u.id, workspaceId: ws.id } })
    expect(m.role).toBe('Viewer')
    expect(await pendingInvites(ws.id)).toHaveLength(0)
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
    expect(await pendingInvites(ws.id)).toHaveLength(0)
  })

  it('a revoked token is refused', async () => {
    const { owner, ws } = await setup()
    const inv = await invite(ws.id, owner.id, 'n@x.test', 'Manager')
    await revokeInvite(inv.id, owner.id)
    await expect(acceptInvite(inv.token, { id: 'u', email: 'n@x.test' })).rejects.toBe('INVALID')
    await expect(revokeInvite(inv.id, owner.id, 'other-ws')).rejects.toBe('NOT_FOUND')
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
  it('two concurrent accepts of one token give exactly one success', async () => {
    const { owner, ws } = await setup()
    const inv = await invite(ws.id, owner.id, 'n@x.test', 'Manager')
    const u = await mkUser('n@x.test', 'Newbie')
    const r = await Promise.allSettled([acceptInvite(inv.token, u), acceptInvite(inv.token, u)])
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
    expect(await db.workspaceMember.count({ where: { userId: u.id } })).toBe(1)
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
