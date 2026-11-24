import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signInAction } from '@/app/(auth)/sign-in/actions'
import { signUpAction } from '@/app/(auth)/sign-up/actions'
import AdminLayout from '@/app/admin/layout'
import ConsoleLayout from '@/app/app/(console)/layout'
import InvoicePrintPage from '@/app/app/(console)/invoices/[id]/print/page'
import { markReadAction } from '@/app/app/(console)/notifications/actions'
import { signOutAction, switchToPlatformAction, switchWorkspaceAction } from '@/app/app/(console)/switch/actions'
import { Modal } from '@/components/shell/Modal'
import { PageHead } from '@/components/shell/PageHead'
import { Account } from '@/components/shell/Account'
import { Switcher } from '@/components/shell/Switcher'
import { Toaster } from '@/components/shell/Toast'
import { auth, signIn as authSignIn, signOut } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireMember } from '@/lib/permissions'
import { hashPassword } from '@/lib/users'

vi.mock('@/lib/auth', () => ({ auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }))
// next-auth itself can't load under vitest; the sign-in action only needs its AuthError class.
vi.mock('next-auth', () => ({ AuthError: class AuthError extends Error {} }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const jar = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => jar }))
// Keep the real redirect() and notFound() (their errors carry the digest Next reads); stub the client hooks.
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => '/app',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

const NOT_FOUND = /NEXT_HTTP_ERROR_FALLBACK;404/

const mkUser = (email: string, name: string, isGlobalAdmin = false) =>
  db.user.create({ data: { email, name, passwordHash: 'x', isGlobalAdmin } })
const mkWs = (name: string, status: 'approved' | 'pending' | 'declined' = 'approved', declineReason?: string) =>
  db.workspace.create({ data: { name, type: 'Brand', country: 'NG', status, declineReason } })
const join = (userId: string, workspaceId: string, role: 'Owner' | 'Manager' | 'Viewer') =>
  db.workspaceMember.create({ data: { userId, workspaceId, role } })
const mkCampaign = (workspaceId: string, status: 'live' | 'review' | 'ended' | 'draft') =>
  db.campaign.create({
    data: {
      workspaceId, name: `C ${status}`, brand: 'B', country: 'NG', category: 'Food & drink', headline: 'H',
      description: 'D', placement: 'card', redeemMethod: 'code', claimCode: 'X', budgetUsd: 100,
      startsAt: new Date(), endsAt: new Date(Date.now() + 86_400_000), shareRewardLabel: 'R', status,
    },
  })
function signIn(u: { id: string; isGlobalAdmin: boolean }, cookie?: string) {
  vi.mocked(auth).mockResolvedValue({ user: { id: u.id, isGlobalAdmin: u.isGlobalAdmin }, expires: '' } as never)
  jar.get.mockImplementation((k: string) => (k === 'of_ws' && cookie ? { value: cookie } : undefined))
}

const page = createElement('p', null, 'page body')
const html = async (Layout: (p: { children: ReactNode }) => Promise<ReactNode>) =>
  renderToStaticMarkup(await Layout({ children: page }))
// The visible text, tags removed, so assertions read like the screen.
const text = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')

beforeEach(() => vi.clearAllMocks())

describe('workspace layout', () => {
  it('tells Global it is acting inside the workspace and links back to Platform; the sidebar is that of the workspace, with no PLATFORM', async () => {
    const admin = await mkUser('admin@x.test', 'Ada Admin', true)
    const owner = await mkUser('tunde@x.test', 'Tunde Okafor')
    const ws = await mkWs('Kola Bright')
    await join(owner.id, ws.id, 'Owner')
    signIn(admin, ws.id)

    const out = await html(ConsoleLayout)
    expect(text(out)).toContain('Platform — you are acting as Global inside Kola Bright.')
    expect(text(out)).toContain('Back to Platform')
    expect(out).not.toContain('href="/admin/review"')
    expect(out).not.toContain('class="grp">Platform<')
    expect(out).toMatch(/class="av"[^>]*>GL</)
    expect(out).toContain('page body')
  })

  it("prints an invoice as Global inside the workspace without the shell: sidebar, top bar, banner, breadcrumb and Print all hide, in one full-width column", async () => {
    const admin = await mkUser('admin@x.test', 'Ada Admin', true)
    const ws = await mkWs('Kola Bright')
    const inv = await db.invoice.create({
      data: {
        workspaceId: ws.id, number: 'INV-0052', period: new Date('2026-09-30T23:00:00Z'), amountCents: 1003, status: 'due', fxPerUsd: 1550,
        country: 'NG', issuedAt: new Date('2026-11-01T00:00:00Z'), dueAt: new Date('2026-11-15T00:00:00Z'),
      },
    })
    signIn(admin, ws.id)
    const out = renderToStaticMarkup(await ConsoleLayout({ children: await InvoicePrintPage({ params: Promise.resolve({ id: inv.id }) }) }))
    // The shell that is on screen for Global inside a workspace.
    for (const cls of ['shell', 'side', 'top', 'banner', 'crumb']) expect(out).toMatch(new RegExp(`class="${cls}[" ]`))
    expect(out).toContain('Back to Platform')

    const print = readFileSync('src/styles/console.css', 'utf8').match(/@media print \{([^@]*)\n\}/)?.[1] ?? ''
    const hidden = print.match(/([^{}]+)\{ display: none !important; \}/)?.[1].split(',').map((s) => s.trim()) ?? []
    expect(hidden).toEqual(expect.arrayContaining(['.side', '.top', '.banner', '.crumb', '.no-print']))
    // The layout's sidebar column goes with the sidebar, and a table fills its box even where narrow screens scroll it.
    expect(print).toContain('.shell { display: block !important; }')
    expect(print).toContain('.box table { display: table !important; }')
  })

  it('shows a Viewer no PLATFORM group and no Platform link', async () => {
    const owner = await mkUser('tunde@x.test', 'Tunde Okafor')
    const viewer = await mkUser('kemi@x.test', 'Kemi Balogun')
    const ws = await mkWs('Kola Bright')
    await join(owner.id, ws.id, 'Owner')
    await join(viewer.id, ws.id, 'Viewer')
    signIn(viewer, ws.id)

    const out = await html(ConsoleLayout)
    expect(out).not.toContain('/admin/')
    expect(out).not.toContain('class="grp">Platform<')
    expect(out).not.toContain('Back to Platform')
    expect(out).not.toContain('class="banner"')
    // The avatar and the account button are the signed-in person; the workspace is the sidebar's head.
    expect(out).toMatch(/class="av"[^>]*>KB</)
    expect(out).toContain('aria-label="Account: Kemi Balogun"')
    expect(out).not.toContain('aria-label="Workspace:')
    expect(text(out)).toContain('Brand workspace · Nigeria')
  })

  it('shows the awaiting-approval banner in a pending workspace', async () => {
    const owner = await mkUser('kofi@x.test', 'Kofi Mensah')
    const ws = await mkWs('SunFresh Juices', 'pending')
    await join(owner.id, ws.id, 'Owner')
    signIn(owner, ws.id)

    const out = await html(ConsoleLayout)
    expect(out).toContain('<b>Awaiting approval</b>')
    expect(text(out)).toContain(
      'Awaiting approval — Global checks new advertisers within one working day. You can build campaigns now; they go live once the workspace is approved.',
    )
  })

  it('shows the declined banner with the reason', async () => {
    const owner = await mkUser('kofi@x.test', 'Kofi Mensah')
    const ws = await mkWs('SunFresh Juices', 'declined', 'No licence.')
    await join(owner.id, ws.id, 'Owner')
    signIn(owner, ws.id)

    expect(text(await html(ConsoleLayout))).toContain(
      "Declined — Global declined this workspace: No licence. Campaigns can't go live until that changes.",
    )
  })

  it('counts running campaigns and due invoices, and the unread bell', async () => {
    const owner = await mkUser('tunde@x.test', 'Tunde Okafor')
    const ws = await mkWs('Kola Bright')
    await join(owner.id, ws.id, 'Owner')
    await mkCampaign(ws.id, 'live')
    await mkCampaign(ws.id, 'review')
    await mkCampaign(ws.id, 'ended')
    await mkCampaign(ws.id, 'draft')
    const inv = { workspaceId: ws.id, period: new Date(), amountCents: 100, fxPerUsd: 1550, country: 'NG' as const, issuedAt: new Date() }
    await db.invoice.create({ data: { ...inv, number: 'INV-1', status: 'due', dueAt: new Date(Date.now() - 86_400_000) } })
    await db.invoice.create({ data: { ...inv, number: 'INV-2', status: 'paid', dueAt: new Date() } })
    await db.notification.createMany({
      data: [
        { userId: owner.id, workspaceId: ws.id, kind: 'pace', title: 'A' },
        { userId: owner.id, workspaceId: ws.id, kind: 'pace', title: 'B', readAt: new Date() },
      ],
    })
    signIn(owner, ws.id)

    const out = await html(ConsoleLayout)
    expect(out).toMatch(/Campaigns<span class="cnt">2<\/span>/)
    expect(out).toMatch(/Invoices<span class="cnt">1<\/span>/)
    expect(out).toMatch(/class="bell"[^]*?<i>1<\/i>/)
    expect(text(out)).toContain('v0.1.0')
  })
})

describe('Platform layout', () => {
  it('answers 404 to a signed-in non-admin', async () => {
    const u = await mkUser('u@x.test', 'U')
    signIn(u)
    await expect(html(AdminLayout)).rejects.toMatchObject({ digest: expect.stringMatching(NOT_FOUND) })
  })

  it('renders the Global brand, the PLATFORM group only and the Platform banner', async () => {
    const admin = await mkUser('admin@x.test', 'Ada Admin', true)
    await mkWs('SunFresh Juices', 'pending')
    signIn(admin)

    const out = await html(AdminLayout)
    expect(out).toMatch(/class="lg"[^>]*>OF</)
    expect(text(out)).toContain('OshoFree Platform console')
    expect(out.match(/class="grp"/g)).toHaveLength(1)
    expect(out).toContain('class="grp">Platform<')
    expect(out).not.toContain('href="/app/')
    expect(out).toMatch(/Review<span class="cnt">1<\/span>/)
    expect(text(out)).toContain(
      'Platform — you are acting as Global. Approvals, rates and settlements here affect every advertiser.',
    )
    expect(out).toMatch(/class="av"[^>]*>GL</)
    expect(out).toContain('aria-label="Account: Ada Admin"')
    expect(text(out)).not.toContain('Platform (Global)')
  })
})

describe('Switcher', () => {
  const items = [
    { id: 'w1', name: 'Kola Bright', type: 'Brand', country: 'NG', status: 'approved', demo: false },
    { id: 'w2', name: 'SunFresh Juices', type: 'Brand', country: 'GH', status: 'pending', demo: false },
  ] as const
  const sw = (props: Partial<Parameters<typeof Switcher>[0]>) =>
    renderToStaticMarkup(createElement(Switcher, { id: 'sw', open: true, currentId: 'w1', isGlobal: true, items: [...items], ...props }))

  it('lists each workspace with its tile, type, country and state, a status dot and the count, then Platform for Global', () => {
    const out = sw({})
    expect(text(out)).toContain('Workspaces · 2')
    expect(text(out)).toContain('KB Kola Bright Brand · Nigeria')
    expect(text(out)).toContain('SJ SunFresh Juices Brand · Ghana · awaiting approval')
    expect(out).toContain('dot dot-approved')
    expect(out).toContain('dot dot-pending')
    expect(text(out)).toContain('Platform (Global) Review, advertisers, rates, settlement')
    expect(text(out)).not.toContain('Sign out')
  })

  it('ticks the row you are in, and only that one', () => {
    const rows = sw({}).split('<form').slice(1)
    expect(rows[0]).toContain('aria-current="true"')
    expect(rows[0]).toContain('class="lucide lucide-check tick"')
    expect(rows[1]).not.toContain('aria-current')
    expect(rows[1]).not.toContain('tick')
    const platform = sw({ currentId: null }).split('<form').slice(1)[2]
    expect(platform).toContain('aria-current="true"')
  })

  it('offers a find field once the list is long enough, not for a short one', () => {
    expect(sw({})).not.toContain('Find a workspace')
    const many = [...items, { ...items[0], id: 'w3', name: 'Pesa Link' }, { ...items[0], id: 'w4', name: 'Ama Foods' }]
    expect(sw({ items: many })).toContain('placeholder="Find a workspace…"')
  })

  it('has no Platform row for a member', () => {
    const out = renderToStaticMarkup(
      createElement(Switcher, { id: 'sw', open: true, currentId: 'w1', isGlobal: false, items: [] }),
    )
    expect(out).not.toContain('Platform (Global)')
  })
})

describe('Account', () => {
  it('names the signed-in person, their email and their role here, then Sign out', () => {
    const out = renderToStaticMarkup(
      createElement(Account, {
        id: 'me',
        open: true,
        account: { name: 'Tunde Okafor', email: 'tunde@kolabright.demo', where: 'Owner · Kola Bright' },
      }),
    )
    expect(out).toContain('aria-label="Account"')
    expect(text(out)).toContain('Tunde Okafor tunde@kolabright.demo Owner · Kola Bright Sign out')
    expect(out).not.toContain('Workspaces')
  })

  it('is closed until the avatar opens it', () => {
    expect(
      renderToStaticMarkup(createElement(Account, { id: 'me', open: false, account: { name: 'T', email: 'e', where: 'w' } })),
    ).toBe('')
  })
})

describe('shell actions', () => {
  it('switches a member only into their own workspace', async () => {
    const u = await mkUser('u@x.test', 'U')
    const mine = await mkWs('Mine')
    const other = await mkWs('Other')
    await join(u.id, mine.id, 'Viewer')
    signIn(u, mine.id)

    await expect(switchWorkspaceAction(other.id)).rejects.toBe('FORBIDDEN')
    expect(jar.set).not.toHaveBeenCalled()
    await expect(switchWorkspaceAction(mine.id)).rejects.toMatchObject({ digest: expect.stringContaining(';/app;') })
    expect(jar.set).toHaveBeenCalledWith('of_ws', mine.id, expect.anything())
  })

  it('takes only Global back to Platform', async () => {
    const u = await mkUser('u@x.test', 'U')
    signIn(u)
    await expect(switchToPlatformAction()).rejects.toMatchObject({ digest: expect.stringMatching(NOT_FOUND) })
    expect(jar.delete).not.toHaveBeenCalled()

    const admin = await mkUser('admin@x.test', 'A', true)
    signIn(admin, 'w1')
    await expect(switchToPlatformAction()).rejects.toMatchObject({ digest: expect.stringContaining(';/admin/review;') })
    expect(jar.delete).toHaveBeenCalledWith('of_ws')
  })

  it('signs out of the workspace too, before the session ends', async () => {
    const owner = await mkUser('tunde@x.test', 'Tunde Okafor')
    signIn(owner, 'w1')
    await signOutAction()
    expect(jar.delete).toHaveBeenCalledWith('of_ws')
    expect(signOut).toHaveBeenCalledWith({ redirectTo: '/sign-in' })
    expect(jar.delete.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(signOut).mock.invocationCallOrder[0])
  })

  it("lands Global on Platform when it signs in where an advertiser's workspace was left open", async () => {
    const owner = await mkUser('tunde@x.test', 'Tunde Okafor')
    const admin = await db.user.create({
      data: { email: 'admin@x.test', name: 'Ada Admin', passwordHash: await hashPassword('right-password'), isGlobalAdmin: true },
    })
    const ws = await mkWs('Kola Bright')
    await join(owner.id, ws.id, 'Owner')
    // The browser still carries Tunde's workspace when Global signs in on it.
    let ofWs: string | undefined = ws.id
    jar.get.mockImplementation((k: string) => (k === 'of_ws' && ofWs ? { value: ofWs } : undefined))
    jar.delete.mockImplementation((k: string) => {
      if (k === 'of_ws') ofWs = undefined
    })
    const form = new FormData()
    form.set('email', 'admin@x.test')
    form.set('password', 'right-password')
    expect(await signInAction(null, form)).toBeNull()
    expect(authSignIn).toHaveBeenCalledWith('credentials', expect.objectContaining({ email: 'admin@x.test', redirectTo: '/app' }))
    expect(jar.delete.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(authSignIn).mock.invocationCallOrder[0])

    vi.mocked(auth).mockResolvedValue({ user: { id: admin.id, isGlobalAdmin: true }, expires: '' } as never)
    await expect(requireMember('view')).rejects.toMatchObject({ digest: expect.stringContaining(';/admin/review;') })
  })

  it('starts a new account outside whatever workspace the browser last had open', async () => {
    signIn({ id: 'nobody', isGlobalAdmin: false }, 'w1')
    const form = new FormData()
    for (const [k, v] of Object.entries({ name: 'Nkem', email: 'nkem@x.test', password: 'password123' })) form.set(k, v)
    expect(await signUpAction(null, form)).toBeNull()
    expect(jar.delete).toHaveBeenCalledWith('of_ws')
    expect(jar.delete.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(authSignIn).mock.invocationCallOrder[0])
  })

  it("marks only the caller's own notification read", async () => {
    const a = await mkUser('a@x.test', 'A')
    const b = await mkUser('b@x.test', 'B')
    const mine = await db.notification.create({ data: { userId: a.id, kind: 'system', title: 'Mine' } })
    const theirs = await db.notification.create({ data: { userId: b.id, kind: 'system', title: 'Theirs' } })
    signIn(a)

    await markReadAction(mine.id)
    await markReadAction(theirs.id)
    expect((await db.notification.findUniqueOrThrow({ where: { id: mine.id } })).readAt).not.toBeNull()
    expect((await db.notification.findUniqueOrThrow({ where: { id: theirs.id } })).readAt).toBeNull()
  })
})

describe('page head, modal, toast', () => {
  it('renders the crumb with earlier links and the last segment in a span, then h1, lead and actions', () => {
    const out = renderToStaticMarkup(
      createElement(PageHead, {
        crumb: [{ label: 'Kola Bright' }, { label: 'Campaigns', href: '/app' }, { label: 'Buy 2 get 1' }],
        title: 'Buy 2 get 1',
        lead: 'Lead.',
        actions: createElement('button', null, 'Pause'),
      }),
    )
    expect(out).toContain('<div class="crumb">Kola Bright › <a href="/app">Campaigns</a> › <span>Buy 2 get 1</span></div>')
    expect(out).toContain('<div class="head"><div><h1>Buy 2 get 1</h1><p>Lead.</p></div><div class="acts"><button>Pause</button></div></div>')
  })

  it("puts a badge beside the h1, not in it, so the heading's name stays the title (Prompt 9's Demo pill)", () => {
    const out = renderToStaticMarkup(
      createElement(PageHead, {
        crumb: [{ label: 'Kola Bright' }],
        title: 'Kola Bright',
        badge: createElement('span', { className: 'dm' }, 'Demo'),
        lead: 'Lead.',
      }),
    )
    expect(out).toContain('<div class="head"><div><div class="ttl"><h1>Kola Bright</h1> <span class="dm">Demo</span></div><p>Lead.</p></div></div>')
  })

  it('renders an open modal as a labelled dialog and nothing when closed', () => {
    const props = { onClose: () => {}, title: 'On Phoenix', children: createElement('p', null, 'Body') }
    const open = renderToStaticMarkup(createElement(Modal, { ...props, open: true }))
    expect(open).toMatch(/^<div class="modal on"><div class="in" role="dialog" aria-modal="true" aria-labelledby="([^"]+)" tabindex="-1"><h3 id="\1">On Phoenix<\/h3><p>Body<\/p>/)
    expect(renderToStaticMarkup(createElement(Modal, { ...props, open: false }))).toBe('')
  })

  it('renders the toast region hidden until a toast is raised', () => {
    expect(renderToStaticMarkup(createElement(Toaster))).toBe('<div class="toast" role="status" aria-live="polite"></div>')
  })
})
