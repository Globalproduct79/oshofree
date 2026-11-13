import { describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { isAdminInDb, requireUser } from '@/lib/session'
import {
  createWorkspace, requireWorkspace, setupChecklist, updateWorkspace, workspaceForUser,
} from '@/lib/workspaces'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/session', () => ({ requireUser: vi.fn(), isAdminInDb: vi.fn() }))
const cookieGet = vi.fn()
vi.mock('next/headers', () => ({ cookies: async () => ({ get: cookieGet }) }))
const redirectMock = vi.fn((to: string) => {
  throw new Error(`REDIRECT:${to}`)
})
vi.mock('next/navigation', () => ({ redirect: (to: string) => redirectMock(to) }))

const user = (email = 'a@x.com') => db.user.create({ data: { email, passwordHash: 'x', name: 'N' } })
const input = { name: 'Acme', type: 'Brand', country: 'NG' } as const

describe('workspaces', () => {
  it('creates a pending workspace with one Owner member', async () => {
    const u = await user()
    const ws = await createWorkspace(u.id, input)
    expect(ws.status).toBe('pending')
    const members = await db.workspaceMember.findMany({ where: { workspaceId: ws.id } })
    expect(members).toHaveLength(1)
    expect(members[0]).toMatchObject({ userId: u.id, role: 'Owner' })
  })

  it('finds the workspace for its user, and null for others', async () => {
    const u = await user()
    const other = await user('b@x.com')
    const ws = await createWorkspace(u.id, input)
    expect((await workspaceForUser(u.id))?.id).toBe(ws.id)
    expect(await workspaceForUser(other.id)).toBeNull()
  })

  it('refuses a second workspace for the same user', async () => {
    const u = await user()
    await createWorkspace(u.id, input)
    await expect(createWorkspace(u.id, input)).rejects.toBe('ALREADY_HAS_WORKSPACE')
  })

  it('updates name, type and country', async () => {
    const u = await user()
    const ws = await createWorkspace(u.id, input)
    const next = await updateWorkspace(ws.id, { name: 'Acme Ltd', type: 'Agency', country: 'KE' })
    expect(next).toMatchObject({ name: 'Acme Ltd', type: 'Agency', country: 'KE' })
  })

  it('reports a fresh checklist, then each fact as it becomes true', async () => {
    const u = await user()
    const ws = await createWorkspace(u.id, input)
    expect(await setupChecklist(ws.id)).toEqual({
      workspace: true, firstCampaign: false, approvedCampaign: false, firstShare: false,
    })
  })

  it('turns checklist facts true from campaigns and non-root shares', async () => {
    const u = await user()
    const ws = await createWorkspace(u.id, input)
    const campaign = await db.campaign.create({
      data: {
        workspaceId: ws.id, name: 'C', brand: 'B', country: 'NG', category: 'Retail', headline: 'h',
        description: 'd', placement: 'featured', redeemMethod: 'link', linkUrl: 'https://x.com',
        budgetUsd: 100, startsAt: new Date(), endsAt: new Date(Date.now() + 86400000),
        shareRewardLabel: 'r',
      },
    })
    expect(await setupChecklist(ws.id)).toMatchObject({ firstCampaign: true, approvedCampaign: false })
    await db.campaign.update({ where: { id: campaign.id }, data: { status: 'paused' } })
    expect(await setupChecklist(ws.id)).toMatchObject({ approvedCampaign: true, firstShare: false })
    const channel = await db.channel.create({ data: { key: 'k', name: 'K', apiKeyHash: 'h' } })
    await db.shareLink.create({
      data: { code: 'root1', campaignId: campaign.id, channelId: channel.id, depth: 0, sharerType: 'Root' },
    })
    expect((await setupChecklist(ws.id)).firstShare).toBe(false)
    await db.shareLink.create({
      data: { code: 'ch1', campaignId: campaign.id, channelId: channel.id, depth: 1, sharerType: 'Channel' },
    })
    expect((await setupChecklist(ws.id)).firstShare).toBe(true)
  })
})

describe('requireWorkspace', () => {
  const signIn = (u: { id: string }, admin: boolean, ogWs?: string) => {
    vi.mocked(requireUser).mockResolvedValue({ id: u.id, email: '', name: '', isGlobalAdmin: admin })
    vi.mocked(isAdminInDb).mockResolvedValue(admin)
    cookieGet.mockImplementation((k: string) => (k === 'of_ws' && ogWs ? { value: ogWs } : undefined))
  }

  it('gives an admin the workspace named by of_ws', async () => {
    const admin = await user('admin@x.com')
    const owner = await user('o@x.com')
    const adminWs = await createWorkspace(admin.id, input)
    const target = await createWorkspace(owner.id, { ...input, name: 'Target' })
    signIn(admin, true, target.id)
    expect((await requireWorkspace()).id).toBe(target.id)
    expect(target.id).not.toBe(adminWs.id)
  })

  it('ignores of_ws for a workspace the user is not in', async () => {
    const u = await user()
    const owner = await user('o@x.com')
    const own = await createWorkspace(u.id, input)
    const target = await createWorkspace(owner.id, { ...input, name: 'Target' })
    signIn(u, false, target.id)
    expect((await requireWorkspace()).id).toBe(own.id)
  })

  it('falls back to the admin\'s own workspace when of_ws names nothing', async () => {
    const admin = await user('admin@x.com')
    const own = await createWorkspace(admin.id, input)
    signIn(admin, true, 'does-not-exist')
    expect((await requireWorkspace()).id).toBe(own.id)
  })

  it('redirects a user with no workspace to /app/new-workspace', async () => {
    const u = await user()
    signIn(u, false)
    await expect(requireWorkspace()).rejects.toThrow('REDIRECT:/app/new-workspace')
    expect(redirectMock).toHaveBeenCalledWith('/app/new-workspace')
  })
})
