import { beforeEach, describe, expect, it, vi } from 'vitest'
import { exitWorkspace, openWorkspace } from '@/app/admin/advertisers/actions'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

const jar = vi.hoisted(() => ({ set: vi.fn(), delete: vi.fn() }))
const redirectTo = vi.hoisted(() => vi.fn())
vi.mock('next/headers', () => ({ cookies: async () => jar }))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    redirectTo(to)
    throw new Error(`REDIRECT:${to}`)
  },
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
}))

async function setup(isGlobalAdmin: boolean) {
  const user = await db.user.create({ data: { email: 'u@x.test', name: 'U', passwordHash: 'x', isGlobalAdmin } })
  const ws = await db.workspace.create({ data: { name: 'Kola', type: 'Brand', country: 'NG', status: 'approved' } })
  vi.mocked(auth).mockResolvedValue({ user: { id: user.id, isGlobalAdmin }, expires: '' } as never)
  return ws
}

describe('openWorkspace / exitWorkspace', () => {
  beforeEach(() => vi.clearAllMocks())

  it('refuses a non-admin without setting the cookie', async () => {
    const ws = await setup(false)
    await expect(openWorkspace(ws.id)).rejects.toThrow('NOT_FOUND')
    expect(jar.set).not.toHaveBeenCalled()
  })

  it('refuses an unknown workspace', async () => {
    await setup(true)
    await expect(openWorkspace('nope')).rejects.toBe('UNKNOWN_WORKSPACE')
    expect(jar.set).not.toHaveBeenCalled()
  })

  it('sets a session cookie and goes to /app for an admin', async () => {
    const ws = await setup(true)
    await expect(openWorkspace(ws.id)).rejects.toThrow('REDIRECT:/app')
    expect(jar.set).toHaveBeenCalledWith('of_ws', ws.id, { httpOnly: true, sameSite: 'lax', path: '/' })
  })

  it('exit clears the cookie and goes back to the list', async () => {
    await setup(true)
    await expect(exitWorkspace()).rejects.toThrow('REDIRECT:/admin/advertisers')
    expect(jar.delete).toHaveBeenCalledWith('of_ws')
  })
})
