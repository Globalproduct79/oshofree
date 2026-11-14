import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updateWorkspaceAction } from '@/app/app/(console)/workspace/actions'
import WorkspacePage from '@/app/app/(console)/workspace/page'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { clientBrands, workspaceStatusBox } from '@/lib/workspaces'

vi.mock('@/lib/auth', () => ({ auth: vi.fn(), signOut: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const jar = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => jar }))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

async function setup(role: 'Owner' | 'Manager' | 'Viewer' | 'Global', opts: { status?: 'pending' | 'approved'; type?: 'Brand' | 'Agency' } = {}) {
  const owner = await db.user.create({ data: { email: 'o@x.test', name: 'Tunde', passwordHash: 'x' } })
  const ws = await db.workspace.create({
    data: { name: 'Kola Bright', type: opts.type ?? 'Brand', country: 'NG', status: opts.status ?? 'approved' },
  })
  await db.workspaceMember.create({ data: { userId: owner.id, workspaceId: ws.id, role: 'Owner' } })
  let actor = owner
  if (role !== 'Owner') {
    const isGlobalAdmin = role === 'Global'
    actor = await db.user.create({ data: { email: 'a@x.test', name: 'Ada', passwordHash: 'x', isGlobalAdmin } })
    if (role !== 'Global') await db.workspaceMember.create({ data: { userId: actor.id, workspaceId: ws.id, role } })
  }
  vi.mocked(auth).mockResolvedValue({ user: { id: actor.id, isGlobalAdmin: role === 'Global' }, expires: '' } as never)
  jar.get.mockImplementation((k: string) => (k === 'of_ws' ? { value: ws.id } : undefined))
  return { ws, actor }
}

const form = (o: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(o)) f.set(k, v)
  return f
}
const mkCampaign = (workspaceId: string, brand: string) =>
  db.campaign.create({
    data: {
      workspaceId, name: `C ${brand}`, brand, country: 'NG', category: 'Food & drink', headline: 'H',
      description: 'D', placement: 'card', redeemMethod: 'code', claimCode: 'X', budgetUsd: 100,
      startsAt: new Date(), endsAt: new Date(Date.now() + 86_400_000), shareRewardLabel: 'R', status: 'draft',
    },
  })

describe('workspace settings', () => {
  beforeEach(() => vi.clearAllMocks())

  it('an Owner saves name and registration number; an empty one clears it', async () => {
    const { ws } = await setup('Owner')
    expect(await updateWorkspaceAction(null, form({ name: 'Kola Ltd', registrationNumber: ' RC 123456 ' }))).toEqual({ saved: true })
    expect(await db.workspace.findUniqueOrThrow({ where: { id: ws.id } })).toMatchObject({ name: 'Kola Ltd', registrationNumber: 'RC 123456' })
    await updateWorkspaceAction(null, form({ name: 'Kola Ltd', type: 'Brand', country: 'NG', registrationNumber: '' }))
    expect((await db.workspace.findUniqueOrThrow({ where: { id: ws.id } })).registrationNumber).toBeNull()
    expect(await db.auditEvent.count({ where: { action: 'workspace.update' } })).toBe(2)
  })

  it('a Manager is refused', async () => {
    await setup('Manager')
    await expect(updateWorkspaceAction(null, form({ name: 'Nope' }))).rejects.toBe('FORBIDDEN')
  })

  it('an approved workspace Owner cannot change country or type', async () => {
    const { ws } = await setup('Owner')
    expect(await updateWorkspaceAction(null, form({ name: 'Kola Bright', type: 'Brand', country: 'KE' }))).toEqual({ error: 'LOCKED' })
    expect(await updateWorkspaceAction(null, form({ name: 'Kola Bright', type: 'Agency', country: 'NG' }))).toEqual({ error: 'LOCKED' })
    expect(await db.workspace.findUniqueOrThrow({ where: { id: ws.id } })).toMatchObject({ type: 'Brand', country: 'NG' })
    // an unchanged type and country is a plain save
    expect(await updateWorkspaceAction(null, form({ name: 'Kola B', type: 'Brand', country: 'NG' }))).toEqual({ saved: true })
  })

  it('a pending workspace Owner can change country and type', async () => {
    const { ws } = await setup('Owner', { status: 'pending' })
    expect(await updateWorkspaceAction(null, form({ name: 'Kola Bright', type: 'Agency', country: 'KE' }))).toEqual({ saved: true })
    expect(await db.workspace.findUniqueOrThrow({ where: { id: ws.id } })).toMatchObject({ type: 'Agency', country: 'KE' })
  })

  it('Global changes an approved workspace country', async () => {
    const { ws } = await setup('Global')
    expect(await updateWorkspaceAction(null, form({ name: 'Kola Bright', type: 'Brand', country: 'GH' }))).toEqual({ saved: true })
    expect((await db.workspace.findUniqueOrThrow({ where: { id: ws.id } })).country).toBe('GH')
  })

  const SAVE = />Save<\/button>/
  const nameInput = (html: string) => html.match(/<input[^>]*name="name"[^>]*>/)?.[0] ?? ''

  it.each(['Owner', 'Global'] as const)('the page offers Save to %s', async (role) => {
    await setup(role)
    const html = renderToStaticMarkup(await WorkspacePage())
    expect(html).toMatch(SAVE)
    expect(nameInput(html)).not.toContain('readOnly')
  })

  it.each(['Manager', 'Viewer'] as const)('a %s sees the fields read-only, with no Save', async (role) => {
    await setup(role)
    const html = renderToStaticMarkup(await WorkspacePage())
    expect(html).not.toMatch(SAVE)
    expect(nameInput(html)).toContain('readOnly')
    expect(html.match(/<input[^>]*name="registrationNumber"[^>]*>/)?.[0]).toContain('readOnly')
    for (const name of ['type', 'country']) expect(html.match(new RegExp(`<select[^>]*name="${name}"[^>]*>`))?.[0]).toContain('disabled')
  })
})

describe('status box and client brands', () => {
  beforeEach(() => vi.clearAllMocks())

  it('prints Since as Mon YYYY', () => {
    const box = workspaceStatusBox({ status: 'approved', creditLimitCents: 150000, createdAt: new Date('2026-10-14T10:00:00Z') })
    expect(box).toEqual({ approval: 'approved', creditLimitCents: 150000, channels: 'Phoenix', since: 'Oct 2026' })
  })

  it('lists distinct brands with counts, most campaigns first', async () => {
    const { ws } = await setup('Owner', { type: 'Agency' })
    await mkCampaign(ws.id, 'Zed'); await mkCampaign(ws.id, 'Amo'); await mkCampaign(ws.id, 'Zed'); await mkCampaign(ws.id, 'Bix')
    expect(await clientBrands(ws.id)).toEqual([
      { brand: 'Zed', campaigns: 2 }, { brand: 'Amo', campaigns: 1 }, { brand: 'Bix', campaigns: 1 },
    ])
  })

  it('the page renders the Status box; only an agency gets Client workspaces', async () => {
    await setup('Owner')
    const brand = renderToStaticMarkup(await WorkspacePage())
    expect(brand).toContain('Status')
    expect(brand).toContain('Phoenix')
    expect(brand).toContain('Ask Global to change this.')
    expect(brand).not.toContain('Client workspaces')
  })

  it('an agency page lists its brands and the Add client brand link', async () => {
    const { ws } = await setup('Owner', { type: 'Agency' })
    await mkCampaign(ws.id, 'Zed')
    const html = renderToStaticMarkup(await WorkspacePage())
    expect(html).toContain('Client workspaces')
    expect(html).toContain('Zed · 1 campaign<')
    expect(html).toContain('/app/campaigns/new?brand=&amp;focus=brand')
  })
})
