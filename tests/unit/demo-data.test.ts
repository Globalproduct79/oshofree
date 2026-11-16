import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdvertiserPage from '@/app/admin/advertisers/[id]/page'
import AdvertisersPage from '@/app/admin/advertisers/page'
import ReviewPage from '@/app/admin/review/page'
import ConsoleLayout from '@/app/app/(console)/layout'
import { Switcher } from '@/components/shell/Switcher'
import { listSwitcher } from '@/lib/active-workspace'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { createUser } from '@/lib/users'
import { createWorkspace } from '@/lib/workspaces'

vi.mock('@/lib/auth', () => ({ auth: vi.fn(), signOut: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const jar = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => jar }))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => '/app',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

// Demo data (Prompt 9): the seed's workspaces carry `demo`, and the console marks each with a grey "Demo" pill —
// the sidebar head and switcher, Platform › Advertisers and an advertiser's page, Review — and a footer line in its
// sidebar. A workspace someone made shows none of it.

const PILL = 'class="dm"'
const FOOTER = 'Demo data — reseeded on each reset'
const DAY = 86_400_000
const count = (markup: string, needle: string) => markup.split(needle).length - 1
const text = (m: string) =>
  m.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

let seq = 0
const mkUser = (name: string, o: { admin?: boolean; demo?: boolean } = {}) =>
  db.user.create({ data: { email: `u${++seq}@x.test`, name, passwordHash: 'x', isGlobalAdmin: o.admin ?? false, demo: o.demo ?? false } })
async function mkWs(name: string, demo: boolean, status: 'approved' | 'pending' = 'approved') {
  const ws = await db.workspace.create({ data: { name, type: 'Brand', country: 'NG', status, demo } })
  const owner = await mkUser(`${name} Owner`, { demo })
  await db.workspaceMember.create({ data: { userId: owner.id, workspaceId: ws.id, role: 'Owner' } })
  return { ws, owner }
}
const mkCampaign = (workspaceId: string, headline: string, status: 'live' | 'review') =>
  db.campaign.create({
    data: {
      workspaceId, name: headline, brand: 'B', country: 'NG', category: 'Food & drink', headline, description: 'D',
      placement: 'card', redeemMethod: 'code', budgetUsd: 100, shareRewardLabel: 'R', status, submittedAt: new Date(),
      startsAt: new Date(Date.now() - DAY), endsAt: new Date(Date.now() + 7 * DAY),
    },
  })
function signIn(u: { id: string; isGlobalAdmin: boolean }, workspaceId?: string) {
  vi.mocked(auth).mockResolvedValue({ user: { id: u.id, isGlobalAdmin: u.isGlobalAdmin }, expires: '' } as never)
  jar.get.mockImplementation((k: string) => (k === 'of_ws' && workspaceId ? { value: workspaceId } : undefined))
}
const layout = async () => renderToStaticMarkup(await ConsoleLayout({ children: createElement('p', null, 'page') as ReactNode }))
// The sidebar's head: the tile, the workspace's name and its sub-line.
const sidebarHead = (m: string) => m.slice(m.indexOf('class="brand"'), m.indexOf('<nav'))
const sidebarFoot = (m: string) => m.slice(m.indexOf('class="foot"'), m.indexOf('</aside>'))

beforeEach(() => vi.clearAllMocks())

describe('what is demo data', () => {
  it('a person who signs up and the workspace they make are not demo, by default', async () => {
    const user = await createUser({ email: 'ama@x.test', password: 'a long password', name: 'Ama' })
    const ws = await createWorkspace(user.id, { name: 'Ama Foods', type: 'Brand', country: 'GH' })
    expect(user.demo).toBe(false)
    expect(ws.demo).toBe(false)
  })
})

describe('the Demo pill', () => {
  it("sits beside a demo workspace's name in the sidebar head, with the footer line; a real workspace shows neither", async () => {
    const demo = await mkWs('Kola Bright', true)
    signIn(demo.owner, demo.ws.id)
    const shown = await layout()
    expect(count(sidebarHead(shown), PILL)).toBe(1)
    expect(text(sidebarHead(shown))).toContain('Kola Bright Demo')
    expect(text(sidebarFoot(shown))).toContain(FOOTER)

    const real = await mkWs('Ama Foods', false)
    signIn(real.owner, real.ws.id)
    const plain = await layout()
    expect(plain).not.toContain(PILL)
    expect(plain).not.toContain(FOOTER)
    expect(text(sidebarHead(plain))).toContain('Ama Foods')
  })

  it('marks the demo rows of the switcher only', async () => {
    const admin = await mkUser('Global', { admin: true })
    await mkWs('Kola Bright', true)
    await mkWs('Ama Foods', false)
    const items = await listSwitcher(admin)
    expect(items.map((i) => [i.name, i.demo])).toEqual([['Ama Foods', false], ['Kola Bright', true]])
    const out = renderToStaticMarkup(createElement(Switcher, { id: 'sw', open: true, currentId: null, isGlobal: true, items }))
    const rows = out.split('<form').slice(1)
    expect(text(rows[0])).not.toContain('Demo')
    expect(count(rows[1], PILL)).toBe(1)
    expect(text(rows[1])).toContain('Kola Bright Demo Brand · Nigeria')
  })

  it("marks a demo workspace's row on Platform › Advertisers and the head of its page, never a real one's", async () => {
    const admin = await mkUser('Global', { admin: true })
    const demo = await mkWs('Kola Bright', true)
    const real = await mkWs('Ama Foods', false)
    signIn(admin)

    const list = renderToStaticMarkup(await AdvertisersPage())
    const rows = list.split('<tr').slice(2)
    const row = (name: string) => rows.find((r) => r.includes(`<b>${name}</b>`)) ?? ''
    expect(count(row('Kola Bright'), PILL)).toBe(1)
    expect(row('Ama Foods')).not.toContain(PILL)

    const page = async (id: string) => renderToStaticMarkup(await AdvertiserPage({ params: Promise.resolve({ id }) }))
    const head = (m: string) => m.slice(m.indexOf('<h1'), m.indexOf('</h1>'))
    const demoPage = await page(demo.ws.id)
    expect(count(head(demoPage), PILL)).toBe(1)
    expect(text(head(demoPage))).toBe('Kola Bright Demo')
    expect(await page(real.ws.id)).not.toContain(PILL)
  })

  it("marks Review's cards of demo workspaces: a new advertiser, a campaign waiting and a live one", async () => {
    const admin = await mkUser('Global', { admin: true })
    await mkWs('SunFresh Juices', true, 'pending')
    await mkWs('Ama Foods', false, 'pending')
    const demo = await mkWs('Kola Bright', true)
    const real = await mkWs('Pesa Link', false)
    await mkCampaign(demo.ws.id, 'Buy 2 get 1', 'review')
    await mkCampaign(real.ws.id, 'Cashback week', 'review')
    await mkCampaign(demo.ws.id, 'Kwik draw', 'live')
    await mkCampaign(real.ws.id, 'Top-up bonus', 'live')
    signIn(admin)

    const out = renderToStaticMarkup(await ReviewPage())
    // Each row or card, up to where it ends (a row's buttons, a card's link).
    const parts = (start: string, end: string) => out.split(start).slice(1).map((p) => p.slice(0, p.indexOf(end)))
    const advertisers = parts('class="q ws"', 'class="acts"')
    const queue = parts('class="q"', 'class="acts"')
    const cards = parts('class="cc"', '</a>')
    const one = (parts: string[], name: string) => parts.find((p) => text(p).includes(name)) ?? ''
    expect(count(one(advertisers, 'SunFresh Juices'), PILL)).toBe(1)
    expect(one(advertisers, 'Ama Foods')).not.toContain(PILL)
    expect(count(one(queue, 'Buy 2 get 1'), PILL)).toBe(1)
    expect(one(queue, 'Cashback week')).not.toContain(PILL)
    expect(count(one(cards, 'Kwik draw'), PILL)).toBe(1)
    expect(one(cards, 'Top-up bonus')).not.toContain(PILL)
    expect(count(out, PILL)).toBe(3)
  })
})
