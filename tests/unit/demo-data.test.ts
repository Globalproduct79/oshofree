import { spawnSync } from 'node:child_process'
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
import { invite } from '@/lib/invitations'
import { recentTopUps } from '@/lib/rewards-ledger'
import { createUser, verifyCredentials } from '@/lib/users'
import { approveWorkspace, createWorkspace } from '@/lib/workspaces'
import { seed } from '../../prisma/seed'
import { main, PLATFORM_AUDIT, removeDemo } from '../../scripts/demo-remove'

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
// The text as a browser reads it (tags removed, nothing added): the pill is never glued to the name before it.
const plain = (m: string) => m.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&amp;/g, '&')
const GLUED = /\SDemo\b/

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
    expect(plain(sidebarHead(shown))).toContain('Kola Bright Demo')
    expect(text(sidebarFoot(shown))).toContain(FOOTER)

    const real = await mkWs('Ama Foods', false)
    signIn(real.owner, real.ws.id)
    const realShell = await layout()
    expect(realShell).not.toContain(PILL)
    expect(realShell).not.toContain(FOOTER)
    expect(text(sidebarHead(realShell))).toContain('Ama Foods')
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
    expect(plain(rows[1])).toContain('Kola Bright Demo')
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
    // Beside the name's link, never inside it: the link is named by the workspace alone.
    expect(row('Kola Bright')).toMatch(/<a [^>]*><b>Kola Bright<\/b><\/a> <span class="dm"/)
    expect(plain(row('Kola Bright'))).toContain('Kola Bright Demo')

    const page = async (id: string) => renderToStaticMarkup(await AdvertiserPage({ params: Promise.resolve({ id }) }))
    // The h1 holds the name alone (its accessible name); the pill sits beside it, in the title's row.
    const demoPage = await page(demo.ws.id)
    expect(demoPage).toContain('<div class="ttl"><h1>Kola Bright</h1> <span class="dm"')
    expect(count(demoPage.slice(demoPage.indexOf('<div class="head">')), PILL)).toBe(1)
    const realPage = await page(real.ws.id)
    expect(realPage).toContain('<h1>Ama Foods</h1>')
    expect(realPage).not.toContain(PILL)
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
    // A card's pill follows its link, never inside it: the link is named by the card alone.
    expect(one(cards, 'Kwik draw')).not.toContain(PILL)
    expect(out).toMatch(/Kwik draw[^]*?<\/a> <span class="dm"[^>]*>Demo<\/span><\/div>/)
    expect(one(cards, 'Top-up bonus')).not.toContain(PILL)
    expect(count(out, PILL)).toBe(3)
    expect(plain(out)).not.toMatch(GLUED)
  })
})

// `npm run demo:remove`: only demo rows go, with everything that hangs off them; it prints the plan first and deletes
// only with DEMO_REMOVE=1.
describe('npm run demo:remove', () => {
  const SLOW = 300_000
  // Every table a workspace's life writes to.
  const workspaceTables = async () => ({
    campaigns: await db.campaign.count(),
    channelEvents: await db.channelEvent.count(),
    linkEvents: await db.linkEvent.count(),
    shareLinks: await db.shareLink.count(),
    consumers: await db.consumer.count(),
    payouts: await db.rewardPayout.count(),
    points: await db.pointsLedger.count(),
    claimCodes: await db.claimCode.count(),
    revisions: await db.campaignRevision.count(),
    ledger: await db.ledgerEntry.count(),
    invoices: await db.invoice.count(),
    creditRequests: await db.creditRequest.count(),
    reviews: await db.reviewAction.count(),
    prefs: await db.notificationPref.count(),
  })
  // The platform's own rows, which no workspace owns.
  const platform = async () => ({
    channels: await db.channel.findMany({ orderBy: { key: 'asc' } }),
    rates: await db.rateCard.count(),
    fx: await db.marketFx.count(),
    shares: await db.channelShare.count(),
    rules: await db.fraudRule.count(),
    aggregator: await db.aggregatorAccount.findMany(),
    topUps: await db.aggregatorTopup.count(),
    statements: await db.settlementStatement.count(),
    jobRuns: await db.jobRun.count(),
  })

  it("deletes the seed's whole world and leaves a real advertiser and the platform's records as they were", async () => {
    await seed(new Date('2026-11-14T10:00:00Z'), { scale: 0.05 })
    // What the seed leaves out but a demo workspace can have by the time it is removed: a credit request, a revised
    // offer waiting, a claim code Phoenix asked for.
    const pesa = await db.workspace.findFirstOrThrow({ where: { name: 'Pesa Link' }, include: { members: true, campaigns: true } })
    const live = pesa.campaigns[0]
    await db.creditRequest.create({ data: { workspaceId: pesa.id, requestedById: pesa.members[0].userId } })
    await db.campaignRevision.create({ data: { campaignId: live.id, data: { headline: 'KSh 60 cashback' } } })
    const phoenix = await db.channel.findUniqueOrThrow({ where: { key: 'phoenix' } })
    await db.claimCode.create({
      data: { code: 'PHX-7Q2K', campaignId: live.id, channelId: phoenix.id, sessionId: 'anon-9', day: new Date('2026-11-14'), validUntil: new Date('2026-11-15') },
    })
    // An advertiser who signed up after the seed, with an invitation out.
    const ama = await createUser({ email: 'ama@amafoods.test', password: 'a long password', name: 'Ama Owusu' })
    const real = await createWorkspace(ama.id, { name: 'Ama Foods', type: 'Brand', country: 'GH' })
    await invite(real.id, ama.id, 'kojo@amafoods.test', 'Manager')
    const seeded = await workspaceTables()
    // Every table a workspace writes to has demo rows to remove.
    for (const [table, n] of Object.entries(seeded)) expect(n, table).toBeGreaterThan(0)
    expect(seeded.campaigns).toBe(9)
    const platformBefore = await platform()

    // The plan, rolled back: every row it would delete, and nothing deleted.
    const plan = await removeDemo({ commit: false })
    expect(plan.database).toMatch(/_test$/)
    expect(plan.workspaces).toEqual(['Kola Bright', 'MediaSpec (agency)', 'Pesa Link', 'SunFresh Juices'])
    expect(plan.people).toHaveLength(8)
    expect(plan.people).not.toContain('ama@amafoods.test')
    expect(plan.kept).toEqual([])
    expect(Object.fromEntries(plan.rows)).toMatchObject({ campaigns: 9, workspaces: 4, people: 8, 'channel events': seeded.channelEvents })
    // The seeded Global's own platform audit rows (the rate card, FX, share, the aggregator's top-up…) go with him.
    const platformAudits = await db.auditEvent.count({ where: { workspaceId: null, actor: { demo: true } } })
    expect(platformAudits).toBeGreaterThan(0)
    expect(Object.fromEntries(plan.rows)[PLATFORM_AUDIT]).toBe(platformAudits)
    // …on their own line of the plan, not among the workspaces' rows.
    const lines: string[] = []
    expect(await main({}, (l) => lines.push(l))).toBe(1)
    expect(lines.find((l) => l.startsWith('  Rows it would delete:'))).not.toContain(PLATFORM_AUDIT)
    expect(lines).toContainEqual(expect.stringMatching(new RegExp(`^  Platform audit rows those people wrote, which it would delete: ${platformAudits} \\(rates, FX, share, key rotations, top-ups, .*"by Unknown"\\.$`)))
    expect(await workspaceTables()).toEqual(seeded)
    expect(await db.workspace.count()).toBe(5)

    const done = await removeDemo({ commit: true })
    expect(done.rows).toEqual(plan.rows)
    // Nothing of the seed's is left in any workspace's table.
    expect(await workspaceTables()).toEqual({
      campaigns: 0, channelEvents: 0, linkEvents: 0, shareLinks: 0, consumers: 0, payouts: 0, points: 0, claimCodes: 0,
      revisions: 0, ledger: 0, invoices: 0, creditRequests: 0, reviews: 0, prefs: 0,
    })
    // Ama, her workspace, her invitation and their history stay.
    expect(await db.workspace.findMany({ select: { name: true, demo: true } })).toEqual([{ name: 'Ama Foods', demo: false }])
    expect(await db.user.findMany({ select: { email: true } })).toEqual([{ email: 'ama@amafoods.test' }])
    expect(await db.workspaceMember.findMany({ select: { userId: true, workspaceId: true } })).toEqual([{ userId: ama.id, workspaceId: real.id }])
    expect(await db.invitation.findMany({ select: { email: true } })).toEqual([{ email: 'kojo@amafoods.test' }])
    expect(await db.notification.findMany({ select: { userId: true } })).toEqual([{ userId: ama.id }])
    const audits = await db.auditEvent.findMany({ select: { actorId: true, workspaceId: true, action: true } })
    expect(audits).toEqual([{ actorId: ama.id, workspaceId: real.id, action: 'member.invite' }])
    expect(await platform()).toEqual(platformBefore)
    // The top-ups stay; with their audit rows and their author gone, each reads "by Unknown".
    const topUps = await recentTopUps()
    expect(topUps.length).toBeGreaterThan(0)
    expect(topUps.map((t) => t.by)).toEqual(topUps.map(() => 'Unknown'))

    // A second run finds nothing.
    expect(await removeDemo({ commit: false })).toMatchObject({ workspaces: [], people: [] })
  }, SLOW)

  it('keeps a demo person whom a real record names, says why, and disables their sign-in; their demo rows still go', async () => {
    // The seeded Global, with the seed's public password.
    const made = await createUser({ email: 'admin@oshofree.demo', password: 'password', name: 'Global Admin' })
    const admin = await db.user.update({ where: { id: made.id }, data: { isGlobalAdmin: true, demo: true } })
    const demo = await mkWs('Kola Bright', true, 'pending')
    await approveWorkspace(demo.ws.id, admin.id)
    // A real advertiser that the seeded Global approved: its decision and audit row name him.
    const real = await mkWs('Ama Foods', false, 'pending')
    await approveWorkspace(real.ws.id, admin.id)

    // The plan says so, and changes nothing: he is still Global, with the same password.
    const lines: string[] = []
    expect(await main({}, (l) => lines.push(l))).toBe(1)
    expect(lines).toContain('  Kept, sign-in disabled: admin@oshofree.demo (decided on a real workspace or campaign)')
    expect(await verifyCredentials('admin@oshofree.demo', 'password')).toMatchObject({ isGlobalAdmin: true })

    const done = await removeDemo({ commit: true })
    expect(done.people).toEqual([demo.owner.email])
    expect(done.kept).toEqual([{ email: admin.email, why: 'decided on a real workspace or campaign' }])
    expect((await db.user.findMany({ select: { id: true } })).map((u) => u.id).sort()).toEqual([admin.id, real.owner.id].sort())
    // Kept, but no longer Global, and the seed's password no longer opens the account.
    expect(await db.user.findUniqueOrThrow({ where: { id: admin.id } })).toMatchObject({ isGlobalAdmin: false, demo: true })
    expect(await verifyCredentials('admin@oshofree.demo', 'password')).toBeNull()
    expect(await db.workspace.findMany({ select: { id: true } })).toEqual([{ id: real.ws.id }])
    // The real workspace's decision and audit row stay; the demo one's went.
    expect(await db.reviewAction.findMany({ select: { targetId: true } })).toEqual([{ targetId: real.ws.id }])
    expect(await db.auditEvent.findMany({ select: { workspaceId: true } })).toEqual([{ workspaceId: real.ws.id }])
  })

  it('keeps a real person who joined a demo workspace: only that membership, its notifications and settings go', async () => {
    const demo = await mkWs('Kola Bright', true)
    const real = await mkWs('Ama Foods', false)
    // Ama (real) is also a Manager in the demo workspace.
    await db.workspaceMember.create({ data: { userId: real.owner.id, workspaceId: demo.ws.id, role: 'Manager' } })
    await db.notification.createMany({
      data: [
        { userId: real.owner.id, workspaceId: demo.ws.id, kind: 'pace', title: 'Kola Bright: pace' },
        { userId: real.owner.id, workspaceId: real.ws.id, kind: 'pace', title: 'Ama Foods: pace' },
      ],
    })
    await db.notificationPref.createMany({
      data: [
        { userId: real.owner.id, workspaceId: demo.ws.id, kind: 'weekly', enabled: true },
        { userId: real.owner.id, workspaceId: real.ws.id, kind: 'weekly', enabled: true },
      ],
    })

    const done = await removeDemo({ commit: true })
    expect(done.people).toEqual([demo.owner.email])
    expect(done.kept).toEqual([])
    expect(await db.user.findMany({ select: { id: true } })).toEqual([{ id: real.owner.id }])
    expect(await db.workspaceMember.findMany({ select: { userId: true, workspaceId: true } })).toEqual([
      { userId: real.owner.id, workspaceId: real.ws.id },
    ])
    expect(await db.notification.findMany({ select: { title: true } })).toEqual([{ title: 'Ama Foods: pace' }])
    expect(await db.notificationPref.findMany({ select: { workspaceId: true } })).toEqual([{ workspaceId: real.ws.id }])
  })

  it('prints the plan and refuses without DEMO_REMOVE=1; with it, deletes', async () => {
    const lines: string[] = []
    expect(await main({}, (l) => lines.push(l))).toBe(0)
    expect(lines).toEqual([expect.stringMatching(/^No demo data in .*_test\.$/)])

    const demo = await mkWs('Kola Bright', true)
    lines.length = 0
    expect(await main({ DEMO_REMOVE: '' }, (l) => lines.push(l))).toBe(1)
    expect(lines).toEqual([
      expect.stringMatching(/^Demo data in .*_test:$/),
      '  Workspaces (1): Kola Bright',
      `  People (1): ${demo.owner.email}`,
      '  Rows it would delete: 1 memberships, 1 workspaces, 1 people',
      'Refusing to delete: nothing was deleted. Run it again with DEMO_REMOVE=1 to delete the rows above.',
    ])
    expect(await db.workspace.count()).toBe(1)

    lines.length = 0
    expect(await main({ DEMO_REMOVE: '1' }, (l) => lines.push(l))).toBe(0)
    expect(lines.at(-1)).toBe('  Rows it deleted: 1 memberships, 1 workspaces, 1 people')
    expect(await db.workspace.count()).toBe(0)
    expect(await db.user.count()).toBe(0)
  })

  it('runs under tsx, as `npm run demo:remove` does, and refuses without DEMO_REMOVE=1', async () => {
    await mkWs('Kola Bright', true)
    const run = spawnSync('npx', ['tsx', 'scripts/demo-remove.ts'], { env: { ...process.env, DEMO_REMOVE: '' }, encoding: 'utf8' })
    expect(run.status, run.stderr).toBe(1)
    expect(run.stdout).toContain('Workspaces (1): Kola Bright')
    expect(run.stdout).toContain('Refusing to delete')
    expect(await db.workspace.count()).toBe(1)
  }, 60_000)
})
