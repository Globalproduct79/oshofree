import { describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { isAdminInDb } from '@/lib/session'

// next-auth can't load under vitest; session.ts only needs auth() to exist.
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

const make = (email: string, isGlobalAdmin: boolean) =>
  db.user.create({ data: { email, passwordHash: 'x', name: 'N', isGlobalAdmin } })

describe('isAdminInDb', () => {
  it('is true for an admin', async () => {
    const u = await make('a@x.com', true)
    expect(await isAdminInDb(u.id)).toBe(true)
  })
  it('is false for a non-admin, and for a demoted admin', async () => {
    const u = await make('b@x.com', false)
    expect(await isAdminInDb(u.id)).toBe(false)
    const a = await make('c@x.com', true)
    await db.user.update({ where: { id: a.id }, data: { isGlobalAdmin: false } })
    expect(await isAdminInDb(a.id)).toBe(false)
  })
  it('is false for a missing id', async () => {
    expect(await isAdminInDb('does-not-exist')).toBe(false)
  })
})
