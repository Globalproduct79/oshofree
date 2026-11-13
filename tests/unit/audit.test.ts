import { describe, expect, it, vi } from 'vitest'
import { audit } from '@/lib/audit'
import { db } from '@/lib/db'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

describe('audit', () => {
  it('stores actor, target, before and after', async () => {
    const u = await db.user.create({ data: { email: 'a@x.com', name: 'N', passwordHash: 'x' } })
    await audit(u.id, 'credit.set', { type: 'Workspace', id: 'w1', workspaceId: 'w1' }, { limit: 100 }, { limit: 200 })
    await audit(u.id, 'noop', { type: 'Workspace', id: 'w2' })
    const rows = await db.auditEvent.findMany({ orderBy: { at: 'asc' } })
    expect(rows[0]).toMatchObject({
      actorId: u.id, action: 'credit.set', targetType: 'Workspace', targetId: 'w1', workspaceId: 'w1',
      before: { limit: 100 }, after: { limit: 200 },
    })
    expect(rows[1]).toMatchObject({ workspaceId: null, before: null, after: null })
  })
})
