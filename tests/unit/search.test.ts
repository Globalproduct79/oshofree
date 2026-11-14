import { beforeEach, describe, expect, it, vi } from 'vitest'
import { platformSearchAction } from '@/app/admin/search/actions'
import { searchAction } from '@/app/app/(console)/search/actions'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { searchPlatform, searchWorkspace } from '@/lib/search'

vi.mock('@/lib/auth', () => ({ auth: vi.fn(), signOut: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const jar = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => jar }))

const base = {
  country: 'NG' as const,
  category: 'Food & drink',
  description: 'd',
  placement: 'card' as const,
  redeemMethod: 'code' as const,
  budgetUsd: 100,
  startsAt: new Date('2026-11-01'),
  endsAt: new Date('2026-12-01'),
  shareRewardLabel: 'x',
}

async function seed() {
  const ws = await db.workspace.create({ data: { name: 'Kola Bright', type: 'Brand', country: 'NG', status: 'approved' } })
  const other = await db.workspace.create({ data: { name: 'Other Co', type: 'Agency', country: 'KE', status: 'approved' } })
  const user = await db.user.create({ data: { email: 'tunde@x.test', name: 'Tunde Okafor', passwordHash: 'x' } })
  await db.workspaceMember.create({ data: { userId: user.id, workspaceId: ws.id, role: 'Viewer' } })
  await db.campaign.create({ data: { ...base, workspaceId: ws.id, name: 'Harvest Promo', brand: 'Kola', headline: 'Fresh kola', status: 'live' } })
  await db.campaign.create({ data: { ...base, workspaceId: ws.id, name: 'Other', brand: 'Zed', headline: 'HARVEST time', status: 'draft' } })
  await db.campaign.create({ data: { ...base, workspaceId: ws.id, name: 'Third', brand: 'harvest brand', headline: 'h', status: 'paused' } })
  await db.campaign.create({ data: { ...base, workspaceId: other.id, name: 'Harvest Elsewhere', brand: 'Q', headline: 'h', status: 'live' } })
  await db.invoice.create({
    data: { workspaceId: ws.id, number: 'INV-2026-0042', period: new Date('2026-10-01'), amountCents: 100, fxPerUsd: 1500, issuedAt: new Date(), dueAt: new Date() },
  })
  return { ws, other, user }
}

describe('search', () => {
  beforeEach(() => vi.clearAllMocks())

  it('groups campaigns by name, headline and brand, case-insensitively, within the workspace', async () => {
    const { ws } = await seed()
    const r = await searchWorkspace(ws.id, 'harvest')
    expect(r.campaigns).toHaveLength(3)
    expect(r.campaigns[0]).toMatchObject({ label: expect.any(String), href: expect.stringMatching(/^\/app\/campaigns\//) })
    expect(r.campaigns.map((c) => c.label)).not.toContain('Harvest Elsewhere')
  })

  it('finds an invoice by number and a person by name or email', async () => {
    const { ws } = await seed()
    const inv = await searchWorkspace(ws.id, 'inv-2026-0042')
    expect(inv.invoices).toEqual([expect.objectContaining({ label: 'INV-2026-0042', sub: 'Oct 2026', href: '/app/invoices' })])
    expect((await searchWorkspace(ws.id, 'okafor')).people[0]).toMatchObject({ label: 'Tunde Okafor', sub: 'tunde@x.test', href: '/app/people' })
    expect((await searchWorkspace(ws.id, 'TUNDE@x')).people).toHaveLength(1)
  })

  it('caps each group at five', async () => {
    const { ws } = await seed()
    for (let i = 0; i < 7; i++) await db.campaign.create({ data: { ...base, workspaceId: ws.id, name: `Many ${i}`, brand: 'b', headline: 'h', status: 'draft' } })
    expect((await searchWorkspace(ws.id, 'many')).campaigns).toHaveLength(5)
  })

  it('a query under two characters returns empty groups', async () => {
    const { ws } = await seed()
    expect(await searchWorkspace(ws.id, ' h ')).toEqual({ campaigns: [], invoices: [], people: [] })
    expect(await searchPlatform('h')).toEqual({ workspaces: [], campaigns: [] })
  })

  it('platform search spans workspaces and every campaign', async () => {
    const { ws, other } = await seed()
    const w = await searchPlatform('other')
    expect(w.workspaces[0]).toMatchObject({ label: 'Other Co', sub: 'Agency · KE · approved', href: `/admin/advertisers/${other.id}` })
    const c = await searchPlatform('harvest')
    expect(c.campaigns).toHaveLength(4)
    const els = c.campaigns.find((x) => x.label === 'Harvest Elsewhere')!
    expect(els).toMatchObject({ sub: 'Other Co · Live', workspaceId: other.id })
    expect(c.campaigns.some((x) => x.workspaceId === ws.id)).toBe(true)
  })

  it('a Viewer searches their workspace; a non-admin is refused the platform search', async () => {
    const { ws, user } = await seed()
    vi.mocked(auth).mockResolvedValue({ user: { id: user.id, isGlobalAdmin: false }, expires: '' } as never)
    jar.get.mockImplementation((k: string) => (k === 'of_ws' ? { value: ws.id } : undefined))
    expect((await searchAction('harvest')).campaigns.length).toBe(3)
    await expect(platformSearchAction('harvest')).rejects.toBeDefined()
  })
})
