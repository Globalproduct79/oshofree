import { readdirSync } from 'node:fs'
import path from 'node:path'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdvertiserPage from '@/app/admin/advertisers/[id]/page'
import AdvertisersPage from '@/app/admin/advertisers/page'
import ApiDocsPage from '@/app/admin/api/page'
import RatesPage from '@/app/admin/rates/page'
import ReviewPage from '@/app/admin/review/page'
import RewardsLedgerPage from '@/app/admin/rewards/page'
import { topUpAndReturn } from '@/app/admin/rewards/RewardsControls'
import TopUpPage from '@/app/admin/rewards/top-up/page'
import SettlementPage from '@/app/admin/settlement/page'
import BillingPage from '@/app/app/(console)/billing/page'
import EditOfferPage from '@/app/app/(console)/campaigns/[id]/edit/page'
import CampaignPage from '@/app/app/(console)/campaigns/[id]/page'
import NewCampaignPage from '@/app/app/(console)/campaigns/new/page'
import InvoicePrintPage from '@/app/app/(console)/invoices/[id]/print/page'
import InvoicesPage from '@/app/app/(console)/invoices/page'
import NotificationsPage from '@/app/app/(console)/notifications/page'
import HomePage from '@/app/app/(console)/page'
import { InviteSent, sendInvite } from '@/app/app/(console)/people/invite/InviteForm'
import InvitePage from '@/app/app/(console)/people/invite/page'
import PeoplePage from '@/app/app/(console)/people/page'
import RewardsPage from '@/app/app/(console)/rewards/page'
import SharingPage from '@/app/app/(console)/sharing/page'
import WorkspacePage from '@/app/app/(console)/workspace/page'
import NewWorkspacePage from '@/app/app/new-workspace/page'
import { takeToast } from '@/components/shell/toast-store'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { inviteUrl } from '@/lib/invitations'

vi.mock('@/lib/auth', () => ({ auth: vi.fn(), signOut: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const jar = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => jar }))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => '/app',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

// Every page under /app and /admin: one PageHead (crumb, title, a lead) and its head controls — one orange
// primary at most, on the right, and at most one white control beside it (the brief's per-page decisions).

const NOT_FOUND = /NEXT_HTTP_ERROR_FALLBACK;404/
const DAY = 86_400_000
let seq = 0

type Role = 'Owner' | 'Manager' | 'Viewer'
const mkUser = (name: string, isGlobalAdmin = false) =>
  db.user.create({ data: { email: `u${++seq}@x.test`, name, passwordHash: 'x', isGlobalAdmin } })
function signIn(u: { id: string; name: string; isGlobalAdmin: boolean }, workspaceId?: string) {
  vi.mocked(auth).mockResolvedValue({ user: { id: u.id, name: u.name, isGlobalAdmin: u.isGlobalAdmin }, expires: '' } as never)
  jar.get.mockImplementation((k: string) => (k === 'of_ws' && workspaceId ? { value: workspaceId } : undefined))
}

// Kola Bright (Nigeria, approved) with its Owner, Global, Phoenix with a Nigerian rate and FX, and — unless
// `empty` — one live campaign and one issued invoice.
async function world({ empty = false } = {}) {
  const ws = await db.workspace.create({
    data: { name: 'Kola Bright', type: 'Brand', country: 'NG', status: 'approved', creditLimitCents: 150_000 },
  })
  const owner = await mkUser('Tunde Okafor')
  await db.workspaceMember.create({ data: { userId: owner.id, workspaceId: ws.id, role: 'Owner' } })
  const admin = await mkUser('Global Admin', true)
  const phoenix = await db.channel.create({ data: { key: 'phoenix', name: 'Phoenix', apiKeyHash: 'h', isLive: true } })
  const from = new Date(Date.now() - 60 * DAY)
  await db.rateCard.create({ data: { channelId: phoenix.id, country: 'NG', placement: 'card', cpmCents: 120, effectiveFrom: from } })
  await db.marketFx.create({ data: { country: 'NG', fxPerUsd: 1550, effectiveFrom: from } })
  if (empty) return { ws, owner, admin, campaignId: '', invoiceId: '' }
  const campaign = await db.campaign.create({
    data: {
      workspaceId: ws.id, name: 'Buy 2 get 1', brand: 'Kola Bright', country: 'NG', category: 'Food & drink',
      headline: 'Buy 2 bottles, get 1 free', description: 'd', placement: 'card', redeemMethod: 'code', claimCode: 'X',
      budgetUsd: 300, shareRewardLabel: 'r', status: 'live', submittedAt: new Date(Date.now() - 3 * DAY),
      startsAt: new Date(Date.now() - 2 * DAY), endsAt: new Date(Date.now() + 12 * DAY),
    },
  })
  const invoice = await db.invoice.create({
    data: {
      workspaceId: ws.id, number: 'INV-0052', period: new Date(Date.now() - 40 * DAY), amountCents: 21_000, status: 'due',
      fxPerUsd: 1550, country: 'NG', issuedAt: new Date(Date.now() - 10 * DAY), dueAt: new Date(Date.now() + 4 * DAY),
    },
  })
  return { ws, owner, admin, campaignId: campaign.id, invoiceId: invoice.id }
}
type World = Awaited<ReturnType<typeof world>>

async function member(w: World, role: Role) {
  if (role === 'Owner') return w.owner
  const u = await mkUser('Kemi Balogun')
  await db.workspaceMember.create({ data: { userId: u.id, workspaceId: w.ws.id, role } })
  return u
}

const text = (markup: string) =>
  markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').trim()

// The element that opens at `start`, through its matching </div>.
function element(markup: string, start: number): string {
  const tag = /<div\b|<\/div>/g
  tag.lastIndex = start
  let depth = 0
  for (let m = tag.exec(markup); m; m = tag.exec(markup)) {
    depth += m[0] === '</div>' ? -1 : 1
    if (depth === 0) return markup.slice(start, m.index + m[0].length)
  }
  throw new Error('unclosed div')
}

// The head as the screen shows it: how many heads and crumbs, the lead, and each control's label and colour.
function head(markup: string) {
  const at = markup.indexOf('<div class="head">')
  const block = at < 0 ? '' : element(markup, at)
  const acts = block.indexOf('<div class="acts">')
  const controls = [...(acts < 0 ? '' : element(block, acts)).matchAll(/<(a|button)\b[^>]*class="(btn[^"]*)"[^>]*>([^]*?)<\/\1>/g)].map(
    (m) => ({ label: text(m[3]), primary: m[2].split(' ').includes('p') }),
  )
  return {
    heads: markup.split('<div class="head">').length - 1,
    crumbs: markup.split('<div class="crumb">').length - 1,
    lead: text(block.match(/<\/h1><p>([^]*?)<\/p>/)?.[1] ?? ''),
    labels: controls.map((c) => c.label),
    primaries: controls.filter((c) => c.primary).map((c) => c.label),
    lastIsPrimary: controls.at(-1)?.primary ?? false,
  }
}

const render = async (node: ReactNode | Promise<ReactNode>) => renderToStaticMarkup(await node)
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const search = { searchParams: Promise.resolve({}) }

type Expect = { controls: string[]; primary?: string }
type PageCase = { as: 'owner' | 'admin' | 'newcomer'; render: (w: World) => Promise<string>; head: Expect }

// The brief's decisions, one row per page file (the route is the file's folder).
const PAGES: Record<string, PageCase> = {
  '/app': { as: 'owner', render: () => render(HomePage(search)), head: { controls: ['+ New campaign'], primary: '+ New campaign' } },
  '/app/campaigns/new': { as: 'owner', render: () => render(NewCampaignPage(search)), head: { controls: ['Campaigns'] } },
  '/app/campaigns/[id]': {
    as: 'owner',
    render: (w) => render(CampaignPage(params(w.campaignId))),
    head: { controls: ['Pause', 'See it on Phoenix', '← Campaigns'] },
  },
  '/app/campaigns/[id]/edit': { as: 'owner', render: (w) => render(EditOfferPage(params(w.campaignId))), head: { controls: ['Campaigns'] } },
  '/app/sharing': { as: 'owner', render: () => render(SharingPage()), head: { controls: [] } },
  '/app/rewards': { as: 'owner', render: () => render(RewardsPage()), head: { controls: ['New campaign'], primary: 'New campaign' } },
  '/app/billing': { as: 'owner', render: () => render(BillingPage(search)), head: { controls: ['Invoices'] } },
  '/app/invoices': { as: 'owner', render: () => render(InvoicesPage()), head: { controls: ['Billing & credit'] } },
  '/app/invoices/[id]/print': { as: 'owner', render: (w) => render(InvoicePrintPage(params(w.invoiceId))), head: { controls: ['Print'] } },
  '/app/people': { as: 'owner', render: () => render(PeoplePage()), head: { controls: ['Invite someone'], primary: 'Invite someone' } },
  '/app/people/invite': { as: 'owner', render: () => render(InvitePage()), head: { controls: ['People'] } },
  '/app/workspace': { as: 'owner', render: () => render(WorkspacePage()), head: { controls: ['People'] } },
  '/app/notifications': { as: 'owner', render: () => render(NotificationsPage()), head: { controls: ['Home'] } },
  '/app/new-workspace': { as: 'newcomer', render: () => render(NewWorkspacePage()), head: { controls: [] } },
  '/admin/review': { as: 'admin', render: () => render(ReviewPage()), head: { controls: [] } },
  '/admin/advertisers': { as: 'admin', render: () => render(AdvertisersPage()), head: { controls: ['Close month'] } },
  '/admin/advertisers/[id]': {
    as: 'admin',
    render: (w) => render(AdvertiserPage(params(w.ws.id))),
    head: { controls: ['Advertisers', 'Enter workspace'], primary: 'Enter workspace' },
  },
  '/admin/rates': { as: 'admin', render: () => render(RatesPage()), head: { controls: ['Phoenix settlement'] } },
  '/admin/settlement': { as: 'admin', render: () => render(SettlementPage(search)), head: { controls: ['Rates'] } },
  '/admin/rewards': { as: 'admin', render: () => render(RewardsLedgerPage()), head: { controls: ['Top up aggregator'], primary: 'Top up aggregator' } },
  '/admin/rewards/top-up': { as: 'admin', render: () => render(TopUpPage()), head: { controls: ['Rewards ledger'] } },
  '/admin/api': { as: 'admin', render: () => render(ApiDocsPage()), head: { controls: ['Rotate key'], primary: 'Rotate key' } },
}

// Every page.tsx under src/app/app and src/app/admin, as its route (route groups dropped).
function routes(): string[] {
  const root = path.resolve('src/app')
  return ['app', 'admin'].flatMap((top) =>
    (readdirSync(path.join(root, top), { recursive: true }) as string[])
      .filter((f) => path.basename(f) === 'page.tsx')
      .map((f) => `/${top}/${path.dirname(f)}`.split(path.sep).join('/').replace(/\/\([^)]+\)/g, '').replace(/\/\.$/, '')),
  )
}

async function renderAs(c: PageCase, w: World) {
  if (c.as === 'owner') signIn(w.owner, w.ws.id)
  else if (c.as === 'admin') signIn(w.admin)
  else signIn(await mkUser('Nkem Obi'))
  return c.render(w)
}

beforeEach(() => {
  vi.clearAllMocks()
  // The demo buttons are Global's and only with DEMO_CONTROLS=1; these heads are the product's.
  vi.stubEnv('DEMO_CONTROLS', '0')
  takeToast()
})
afterEach(() => vi.unstubAllEnvs())

describe('page heads', () => {
  it('covers every page under /app and /admin', () => {
    expect(routes().sort()).toEqual(Object.keys(PAGES).sort())
  })

  for (const [route, c] of Object.entries(PAGES)) {
    it(`${route}: one head with a lead, and ${c.head.controls.length ? c.head.controls.join(' + ') : 'no controls'}`, async () => {
      const h = head(await renderAs(c, await world()))
      expect(h.heads).toBe(1)
      expect(h.crumbs).toBe(1)
      expect(h.lead.length).toBeGreaterThan(0)
      expect(h.labels).toEqual(c.head.controls)
      expect(h.primaries).toEqual(c.head.primary ? [c.head.primary] : [])
      if (c.head.primary) expect(h.lastIsPrimary).toBe(true)
    })
  }

  it('gives a Viewer no head control that changes anything', async () => {
    const w = await world()
    signIn(await member(w, 'Viewer'), w.ws.id)
    expect(head(await render(HomePage(search))).labels).toEqual([])
    expect(head(await render(RewardsPage())).labels).toEqual([])
    expect(head(await render(PeoplePage())).labels).toEqual([])
    expect(head(await render(NotificationsPage())).labels).toEqual(['Home'])
  })

  it('gives a Manager New campaign but not Invite someone', async () => {
    const w = await world()
    signIn(await member(w, 'Manager'), w.ws.id)
    expect(head(await render(HomePage(search))).primaries).toEqual(['+ New campaign'])
    expect(head(await render(RewardsPage())).primaries).toEqual(['New campaign'])
    expect(head(await render(PeoplePage())).labels).toEqual([])
  })
})

describe('the two new pages', () => {
  it('Invite someone opens the invite form on its own page; People no longer holds it', async () => {
    const w = await world()
    signIn(w.owner, w.ws.id)
    const people = await render(PeoplePage())
    expect(people).toContain('href="/app/people/invite"')
    expect(people).not.toContain('Send invite')
    expect(people).not.toContain('name@company.com')

    const invite = await render(InvitePage())
    expect(text(invite)).toContain('Kola Bright › Organisation › People › Invite')
    expect(invite).toContain('placeholder="name@company.com"')
    expect(invite).toMatch(/<select[^>]*>[^]*?<option[^>]*>Manager<\/option>/)
    expect(invite).toContain('Send invite')
  })

  it('sends a Manager or a Viewer who opens the invite page back to People', async () => {
    const w = await world()
    for (const role of ['Manager', 'Viewer'] as const) {
      signIn(await member(w, role), w.ws.id)
      await expect(InvitePage()).rejects.toMatchObject({ digest: expect.stringContaining(';/app/people;') })
    }
  })

  it('shows the inviter the link their own invite made, in a field to copy, never in a toast', async () => {
    const w = await world()
    signIn(w.owner, w.ws.id)
    expect(await sendInvite('nope', 'Viewer')).toBeNull()
    expect(takeToast()?.message).toBe('Enter a valid email')

    const sent = await sendInvite(' Ada@X.test ', 'Viewer')
    const inv = await db.invitation.findFirstOrThrow({ where: { workspaceId: w.ws.id, email: 'ada@x.test' } })
    expect(sent).toEqual({ email: 'ada@x.test', url: inviteUrl(inv.token) })
    expect(inv.role).toBe('Viewer')
    expect(takeToast()?.message).toBe('Invite sent')

    const box = renderToStaticMarkup(createElement(InviteSent, { sent: sent! }))
    expect(text(box)).toContain('Invite link Invite sent to ada@x.test. Copy the link and send it to them.')
    expect(box).toContain(`readOnly="" value="${inviteUrl(inv.token)}"`)
    expect(box).toContain('href="/app/people"')
  })

  it('ships no open invite link to the invite page', async () => {
    const w = await world()
    const inv = await db.invitation.create({
      data: { workspaceId: w.ws.id, email: 'p@x.test', role: 'Viewer', token: 'c0ffee'.repeat(5) + 'ab', invitedById: w.owner.id, expiresAt: new Date(Date.now() + DAY) },
    })
    signIn(w.owner, w.ws.id)
    const tree = await InvitePage()
    expect(JSON.stringify(tree)).not.toContain(inv.token)
    expect(renderToStaticMarkup(tree)).not.toContain(inv.token)
  })

  it('Top up aggregator opens the top-up form on its own page; the ledger no longer holds it', async () => {
    const w = await world()
    signIn(w.admin)
    const ledger = await render(RewardsLedgerPage())
    expect(ledger).toContain('href="/admin/rewards/top-up"')
    expect(ledger).not.toContain('Amount (USD)')
    expect(text(ledger)).toContain('Recent top-ups No top-ups yet.')

    const topUp = await render(TopUpPage())
    expect(text(topUp)).toContain('Platform › Rewards ledger › Top up aggregator')
    expect(topUp).toContain('Amount (USD)')
    expect(topUp).toMatch(/<button[^>]*type="submit"[^>]*>Top up<\/button>/)
  })

  it('refuses the top-up page to a non-admin', async () => {
    const w = await world()
    signIn(w.owner, w.ws.id)
    await expect(TopUpPage()).rejects.toMatchObject({ digest: expect.stringMatching(NOT_FOUND) })
  })

  it('a top-up says so and returns to the ledger; a refusal stays on the page', async () => {
    const go = vi.fn()
    await topUpAndReturn('1000', async (d) => (d === 1000 ? { toast: 'Aggregator topped up' } : { error: 'no' }), go)
    expect(takeToast()?.message).toBe('Aggregator topped up')
    expect(go).toHaveBeenCalledWith('/admin/rewards')

    go.mockClear()
    await topUpAndReturn('', async () => ({ error: 'Enter an amount above zero.' }), go)
    expect(takeToast()?.message).toBe('Enter an amount above zero.')
    expect(go).not.toHaveBeenCalled()
  })
})

describe('Workspace', () => {
  it("offers an agency's Add client brand only to those who can create campaigns", async () => {
    const w = await world()
    await db.workspace.update({ where: { id: w.ws.id }, data: { type: 'Agency' } })
    signIn(w.owner, w.ws.id)
    expect(await render(WorkspacePage())).toContain('href="/app/campaigns/new?brand=&amp;focus=brand"')
    signIn(await member(w, 'Manager'), w.ws.id)
    expect(await render(WorkspacePage())).toContain('href="/app/campaigns/new?brand=&amp;focus=brand"')
    signIn(await member(w, 'Viewer'), w.ws.id)
    const viewer = await render(WorkspacePage())
    expect(viewer).toContain('Client workspaces')
    expect(viewer).not.toContain('/app/campaigns/new')
  })
})

describe('empty states', () => {
  it('Sharing and Rewards, before any campaign, say what is missing and link to New campaign', async () => {
    const w = await world({ empty: true })
    signIn(w.owner, w.ws.id)
    const sharing = await render(SharingPage())
    expect(text(sharing)).toContain('No shares yet. Shares start once a campaign is live on Phoenix.')
    expect(sharing).toMatch(/<a [^>]*href="\/app\/campaigns\/new"[^>]*>New campaign<\/a>/)
    const rewards = await render(RewardsPage())
    expect(text(rewards)).toContain('No rewards yet. Set a share reward when you create a campaign.')
    expect(rewards.match(/href="\/app\/campaigns\/new"/g)?.length).toBe(2)
  })

  it('Sharing and Rewards with a live campaign show it, not the empty line', async () => {
    const w = await world()
    signIn(w.owner, w.ws.id)
    expect(text(await render(SharingPage()))).not.toContain('No shares yet.')
    expect(text(await render(RewardsPage()))).not.toContain('No rewards yet.')
  })

  it('a Viewer gets the empty line without a link they cannot follow', async () => {
    const w = await world({ empty: true })
    signIn(await member(w, 'Viewer'), w.ws.id)
    expect(await render(SharingPage())).not.toContain('href="/app/campaigns/new"')
    expect(await render(RewardsPage())).not.toContain('href="/app/campaigns/new"')
  })

  it('Billing, People and the Rewards ledger say what an empty list means', async () => {
    const w = await world()
    signIn(w.owner, w.ws.id)
    expect(text(await render(BillingPage(search)))).toContain(
      'Nothing charged yet. Delivery and rewards appear here daily once a campaign is live.',
    )
    expect(text(await render(PeoplePage()))).toContain('Open invites No open invites.')
    signIn(w.admin)
    expect(text(await render(RewardsLedgerPage()))).toContain("No rewards yet. They appear as sharers' friends claim offers.")
  })

  it('People lists an open invite in Open invites, with its controls for the Owner', async () => {
    const w = await world()
    await db.invitation.create({
      data: { workspaceId: w.ws.id, email: 'p@x.test', role: 'Viewer', token: 'c0ffee'.repeat(5) + 'ab', invitedById: w.owner.id, expiresAt: new Date(Date.now() + DAY) },
    })
    signIn(w.owner, w.ws.id)
    const t = text(await render(PeoplePage()))
    expect(t).toContain('Open invites P p@x.test Invited · Viewer Copy invite link Revoke')
    expect(t).not.toContain('No open invites.')
  })
})
