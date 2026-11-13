import { describe, expect, it } from 'vitest'
import { createUser, verifyCredentials } from '@/lib/users'

const input = { email: 'Ada@Brand.com', password: 'correct-horse', name: 'Ada' }

describe('users', () => {
  it('verifies the right password and returns the user', async () => {
    const created = await createUser(input)
    const user = await verifyCredentials('ada@brand.com', 'correct-horse')
    expect(user?.id).toBe(created.id)
  })

  it('returns null for a wrong password or unknown email', async () => {
    await createUser(input)
    expect(await verifyCredentials('ada@brand.com', 'nope')).toBeNull()
    expect(await verifyCredentials('who@brand.com', 'correct-horse')).toBeNull()
  })

  it('throws EMAIL_TAKEN on a duplicate email, whatever its case', async () => {
    await createUser(input)
    await expect(createUser({ ...input, email: 'ADA@brand.com' })).rejects.toBe('EMAIL_TAKEN')
  })

  it('stores the email lower-cased and never the plain password', async () => {
    const user = await createUser(input)
    expect(user.email).toBe('ada@brand.com')
    expect(user.passwordHash).not.toContain('correct-horse')
  })
})
