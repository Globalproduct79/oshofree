import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signInAction } from '@/app/(auth)/sign-in/actions'
import SignInPage from '@/app/(auth)/sign-in/page'
import { signUpAction } from '@/app/(auth)/sign-up/actions'
import SignUpPage from '@/app/(auth)/sign-up/page'
import ConsoleLayout from '@/app/app/(console)/layout'
import HomePage from '@/app/app/(console)/page'
import { inviteAction } from '@/app/app/(console)/people/actions'
import { createWorkspaceAction } from '@/app/app/new-workspace/actions'
import { acceptInviteAction, signInAsSomeoneElseAction } from '@/app/invite/[token]/actions'
import InvitePage from '@/app/invite/[token]/page'
import { firstTime, withoutParam } from '@/components/shell/ArrivalToast'
import { auth, signIn as authSignIn, signOut } from '@/lib/auth'
import { INVITE_PAGE } from '@/lib/copy-people'
import { SHELL } from '@/lib/copy-shell'
import { db } from '@/lib/db'
import { validInvite } from '@/lib/invitations'
import { hashPassword } from '@/lib/users'
import { approveWorkspace } from '@/lib/workspaces'

vi.mock('@/lib/auth', () => ({ auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }))
// next-auth itself can't load under vitest; the sign-in action only needs its AuthError class.
vi.mock('next-auth', () => ({ AuthError: class AuthError extends Error {} }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const jar = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => jar }))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => '/app',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

// Prompt 4: an invite link leads to an account in the right workspace, with the role it names; a new owner's
// workspace waits for Global with the banner showing for everyone in it, and invites can go out meanwhile.

const DAY = 86_400_000
const TOKEN = 'c0ffee'.repeat(5) + 'ab'
let seq = 0

const mkUser = async (name: string, email = `u${++seq}@x.test`, password?: string) =>
  db.user.create({ data: { email, name, passwordHash: password ? await hashPassword(password) : 'x' } })
function signIn(u: { id: string; name?: string; email?: string } | null, workspaceId?: string) {
  vi.mocked(auth).mockResolvedValue(
    (u ? { user: { id: u.id, name: u.name, email: u.email, isGlobalAdmin: false }, expires: '' } : null) as never,
  )
  jar.get.mockImplementation((k: string) => (k === 'of_ws' && workspaceId ? { value: workspaceId } : undefined))
}

// The browser's of_ws cookie, starting at the workspace it last had open; the actions' writes stick, as a
// browser's would. Returns a reader for what the cookie holds now.
function browserCookie(open?: string) {
  let ofWs = open
  jar.get.mockImplementation((k: string) => (k === 'of_ws' && ofWs ? { value: ofWs } : undefined))
  jar.set.mockImplementation((k: string, v: string) => {
    if (k === 'of_ws') ofWs = v
  })
  jar.delete.mockImplementation((k: string) => {
    if (k === 'of_ws') ofWs = undefined
  })
  return () => ofWs
}

// The of_ws delete (the action's fresh start) came before the join's write.
function clearedThenJoined() {
  const del = jar.delete.mock.calls.findIndex(([k]) => k === 'of_ws')
  const set = jar.set.mock.calls.findIndex(([k]) => k === 'of_ws')
  expect(del).toBeGreaterThanOrEqual(0)
  expect(set).toBeGreaterThanOrEqual(0)
  expect(jar.delete.mock.invocationCallOrder[del]).toBeLessThan(jar.set.mock.invocationCallOrder[set])
}

// Kola Bright with Tunde as Owner and one open invite for Ada as `role`.
async function world(role: 'Manager' | 'Viewer' = 'Manager', invite: { expiresAt?: Date; revokedAt?: Date; acceptedAt?: Date } = {}) {
  const ws = await db.workspace.create({ data: { name: 'Kola Bright', type: 'Brand', country: 'NG', status: 'approved' } })
  const owner = await mkUser('Tunde Okafor', 'tunde@x.test')
  await db.workspaceMember.create({ data: { userId: owner.id, workspaceId: ws.id, role: 'Owner' } })
  const inv = await db.invitation.create({
    data: {
      workspaceId: ws.id, email: 'ada@x.test', role, token: TOKEN, invitedById: owner.id,
      expiresAt: invite.expiresAt ?? new Date(Date.now() + 5 * DAY), revokedAt: invite.revokedAt, acceptedAt: invite.acceptedAt,
    },
  })
  return { ws, owner, inv }
}

// The <input …> tag named `name`, whatever order its attributes come in.
const inputTag = (markup: string, name: string) => markup.match(new RegExp(`<input\\b[^>]*\\bname="${name}"[^>]*>`))?.[0] ?? ''
const text = (markup: string) =>
  markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').trim()
const form = (fields: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}
const search = (q: Record<string, string>) => ({ searchParams: Promise.resolve(q) })
const page = async (node: Promise<React.ReactNode> | React.ReactNode) => renderToStaticMarkup(await node)

beforeEach(() => {
  vi.clearAllMocks()
  jar.set.mockReset()
  jar.delete.mockReset()
})

describe('validInvite', () => {
  it('gives an open invite with its workspace, and null for one accepted, revoked, expired or unknown', async () => {
    const { ws } = await world()
    const inv = await validInvite(TOKEN)
    expect([inv?.email, inv?.role, inv?.workspace.name]).toEqual(['ada@x.test', 'Manager', ws.name])
    expect(await validInvite('')).toBeNull()
    expect(await validInvite('nope')).toBeNull()
    for (const dead of [{ acceptedAt: new Date() }, { revokedAt: new Date() }, { expiresAt: new Date(Date.now() - 1000) }]) {
      await db.invitation.update({ where: { token: TOKEN }, data: { acceptedAt: null, revokedAt: null, expiresAt: new Date(Date.now() + DAY), ...dead } })
      expect(await validInvite(TOKEN)).toBeNull()
    }
  })
})

describe('sign-up and sign-in opened from an invite link', () => {
  for (const [name, Page] of [['sign-up', SignUpPage], ['sign-in', SignInPage]] as const) {
    it(`${name}: says which workspace and role it joins, and starts the email at the invited address (editable)`, async () => {
      await world('Viewer')
      const html = await page(Page(search({ invite: TOKEN })))
      expect(text(html)).toContain(INVITE_PAGE.joining('Kola Bright', 'Viewer'))
      expect(inputTag(html, 'email')).toContain('value="ada@x.test"')
      expect(inputTag(html, 'email')).not.toMatch(/\s(readOnly|disabled)=/i)
      expect(inputTag(html, 'invite')).toContain(`value="${TOKEN}"`)
    })

    it(`${name}: without an invite there is no banner and the email starts empty`, async () => {
      const html = await page(Page(search({})))
      expect(text(html)).not.toContain("You're joining")
      expect(inputTag(html, 'email')).not.toContain('value=')
      expect(inputTag(html, 'invite')).toContain('value=""')
    })

    it(`${name}: a link that can no longer be accepted says so, says to ask for a new one, and offers a way on without it`, async () => {
      await world('Manager', { expiresAt: new Date(Date.now() - DAY) })
      const way = name === 'sign-up' ? { href: '/sign-up', label: INVITE_PAGE.signUpWithout } : { href: '/sign-in', label: INVITE_PAGE.signInWithout }
      for (const token of [TOKEN, 'nope']) {
        const html = await page(Page(search({ invite: token })))
        expect(text(html)).toBe(`${INVITE_PAGE.invalid} ${INVITE_PAGE.askForNew} ${way.label}`)
        expect(html).toMatch(new RegExp(`<a [^>]*href="${way.href}"[^>]*>${way.label}</a>`))
        expect(html).not.toContain('<form')
        expect(html).not.toContain(token === TOKEN ? TOKEN : 'name="invite"')
      }
    })
  }

  it('sign-up says nothing about creating a workspace, with or without an invite', async () => {
    await world()
    for (const q of [{}, { invite: TOKEN }] as Record<string, string>[]) expect(text(await page(SignUpPage(search(q))))).not.toMatch(/workspace/i)
  })

  it('sign-in keeps the callbackUrl it was given', async () => {
    const html = await page(SignInPage(search({ callbackUrl: '/app/billing' })))
    expect(inputTag(html, 'callbackUrl')).toContain('value="/app/billing"')
  })
})

describe('joining from an invite link', () => {
  it('sign-up joins the workspace with the invited role, opens it, and lands on its home saying so', async () => {
    const { ws } = await world('Viewer')
    signIn(null)
    // This browser last had another workspace open; the new account must end up in the one it joined.
    const cookie = browserCookie('somebody-elses-workspace')
    expect(await signUpAction(null, form({ name: 'Ada Obi', email: 'ada.other@x.test', password: 'password123', invite: TOKEN }))).toBeNull()
    const ada = await db.user.findUniqueOrThrow({ where: { email: 'ada.other@x.test' } })
    expect((await db.workspaceMember.findFirstOrThrow({ where: { userId: ada.id } })).role).toBe('Viewer')
    clearedThenJoined()
    expect(cookie()).toBe(ws.id)
    expect(authSignIn).toHaveBeenCalledWith('credentials', expect.objectContaining({ redirectTo: `/app?joined=${ws.id}` }))
  })

  it('sign-in with an invite joins, opens the joined workspace over the one last open, and lands on its home saying so', async () => {
    const { ws } = await world('Manager')
    const ada = await mkUser('Ada Obi', 'ada@x.test', 'right-password')
    const before = await db.workspace.create({ data: { name: 'Obi Foods', type: 'Brand', country: 'NG', status: 'approved' } })
    await db.workspaceMember.create({ data: { userId: ada.id, workspaceId: before.id, role: 'Owner' } })
    signIn(null)
    const cookie = browserCookie(before.id)
    expect(await signInAction(null, form({ email: 'ada@x.test', password: 'right-password', invite: TOKEN }))).toBeNull()
    expect((await db.workspaceMember.findUniqueOrThrow({ where: { userId_workspaceId: { userId: ada.id, workspaceId: ws.id } } })).role).toBe('Manager')
    clearedThenJoined()
    expect(cookie()).toBe(ws.id)
    expect(authSignIn).toHaveBeenCalledWith('credentials', expect.objectContaining({ redirectTo: `/app?joined=${ws.id}` }))
  })

  it('a link that died before the form was sent joins nothing and lands on /app as before', async () => {
    await world('Manager', { revokedAt: new Date() })
    signIn(null)
    const cookie = browserCookie('somebody-elses-workspace')
    expect(await signUpAction(null, form({ name: 'Ada Obi', email: 'ada@x.test', password: 'password123', invite: TOKEN }))).toBeNull()
    expect(await db.workspaceMember.count({ where: { user: { email: 'ada@x.test' } } })).toBe(0)
    expect(cookie()).toBeUndefined()
    expect(authSignIn).toHaveBeenCalledWith('credentials', expect.objectContaining({ redirectTo: '/app' }))
  })

  it("the home says \"You've joined {workspace} as {role}.\" once, only for the workspace that was joined", async () => {
    const { ws } = await world()
    const ada = await mkUser('Ada Obi')
    await db.workspaceMember.create({ data: { userId: ada.id, workspaceId: ws.id, role: 'Viewer' } })
    signIn(ada, ws.id)
    const said = INVITE_PAGE.joined('Kola Bright', 'Viewer')
    expect(said).toBe("You've joined Kola Bright as Viewer.")
    const tree = JSON.stringify(await HomePage(search({ joined: ws.id })))
    expect(tree).toContain(said)
    // Once per tab for this person in this workspace, so going back to the cached home doesn't say it again, but a
    // second person joining the same workspace on the same browser is still told.
    expect(tree).toContain(`"onceKey":"joined:${ada.id}:${ws.id}"`)
    expect(tree).toContain('"param":"joined"')
    expect(JSON.stringify(await HomePage(search({})))).not.toContain(said)
    expect(JSON.stringify(await HomePage(search({ joined: 'another-workspace' })))).not.toContain(said)
  })
})

describe('the arrival toast', () => {
  // A sessionStorage stand-in.
  const storage = () => {
    const m = new Map<string, string>()
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
  }

  it('says it once per key in a tab, so back or forward to the cached home stays quiet', () => {
    const tab = storage()
    expect(firstTime('joined:w1', () => tab)).toBe(true)
    expect(firstTime('joined:w1', () => tab)).toBe(false)
    expect(firstTime('joined:w2', () => tab)).toBe(true)
  })

  it('still says it when storage is refused (private mode, blocked site data)', () => {
    const refusing = () => {
      throw new Error('SecurityError')
    }
    expect(firstTime('joined:w1', refusing)).toBe(true)
    const broken = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError') } }
    expect(firstTime('joined:w1', () => broken)).toBe(true)
  })

  it('drops only its own query from the address, keeping the rest and the hash', () => {
    expect(withoutParam('http://x.test/app?joined=w1', 'joined')).toBe('/app')
    expect(withoutParam('http://x.test/app?filter=live&joined=w1#top', 'joined')).toBe('/app?filter=live#top')
    expect(withoutParam('http://x.test/app?filter=live', 'joined')).toBe('/app?filter=live')
  })
})

describe('the invite page', () => {
  it('signed out: who invited you, to what, as what; Create an account and Sign in carry the link', async () => {
    await world('Manager')
    signIn(null)
    const html = await page(InvitePage({ params: Promise.resolve({ token: TOKEN }) }))
    expect(text(html)).toContain(INVITE_PAGE.headline('Tunde Okafor', 'Kola Bright', 'Manager'))
    expect(html).toContain(`href="/sign-up?invite=${TOKEN}"`)
    expect(html).toContain(`href="/sign-in?invite=${TOKEN}"`)
    expect(text(html)).not.toContain('signed in as')
  })

  it('signed in as someone: names them, offers Accept as {name} or Sign in as someone else', async () => {
    await world('Manager')
    const kemi = await mkUser('Kemi Balogun', 'kemi@x.test')
    signIn(kemi)
    const html = await page(InvitePage({ params: Promise.resolve({ token: TOKEN }) }))
    const t = text(html)
    expect(t).toContain(INVITE_PAGE.headline('Tunde Okafor', 'Kola Bright', 'Manager'))
    expect(t).toContain(INVITE_PAGE.signedInAs('Kemi Balogun', 'kemi@x.test'))
    expect(html).toMatch(new RegExp(`<button[^>]*type="submit"[^>]*>${INVITE_PAGE.acceptAs('Kemi Balogun')}</button>`))
    expect(html).toMatch(new RegExp(`<button[^>]*type="submit"[^>]*>${INVITE_PAGE.signInOther}</button>`))
    expect(html).not.toContain('href="/sign-up?invite=')
  })

  it('a dead link says so and to ask for a new one, and offers nothing to act on, signed in or not', async () => {
    await world('Manager', { acceptedAt: new Date() })
    for (const who of [null, await mkUser('Kemi Balogun')]) {
      signIn(who)
      const html = await page(InvitePage({ params: Promise.resolve({ token: TOKEN }) }))
      expect(text(html)).toContain(`${INVITE_PAGE.invalid} ${INVITE_PAGE.askForNew}`)
      expect(html).not.toMatch(/<a |<form|<button/)
    }
  })

  it('someone already in the workspace is told so and offered its home; the invite is left for its invitee', async () => {
    const { ws } = await world('Viewer')
    const kemi = await mkUser('Kemi Balogun', 'kemi@x.test')
    await db.workspaceMember.create({ data: { userId: kemi.id, workspaceId: ws.id, role: 'Manager' } })
    signIn(kemi)
    const html = await page(InvitePage({ params: Promise.resolve({ token: TOKEN }) }))
    const t = text(html)
    expect(t).toContain(INVITE_PAGE.alreadyIn('Kola Bright'))
    expect(t).not.toContain(INVITE_PAGE.headline('Tunde Okafor', 'Kola Bright', 'Viewer'))
    expect(html).toMatch(new RegExp(`<button[^>]*type="submit"[^>]*>${INVITE_PAGE.open('Kola Bright')}</button>`))
    expect(html).toMatch(new RegExp(`<button[^>]*type="submit"[^>]*>${INVITE_PAGE.signInOther}</button>`))
    expect(t).not.toContain('Accept as')

    // A stale Accept (the page was open before they joined) doesn't take the invite either.
    await expect(acceptInviteAction(TOKEN)).rejects.toMatchObject({ digest: expect.stringContaining(`;/invite/${TOKEN};`) })
    expect(await validInvite(TOKEN)).not.toBeNull()
    expect((await db.workspaceMember.findFirstOrThrow({ where: { userId: kemi.id } })).role).toBe('Manager')
    expect(await db.auditEvent.count({ where: { action: 'member.join' } })).toBe(0)
  })

  it('Accept as {name} joins that account with the invited role and lands on the home saying so', async () => {
    const { ws } = await world('Viewer')
    const kemi = await mkUser('Kemi Balogun', 'kemi@x.test')
    signIn(kemi)
    await expect(acceptInviteAction(TOKEN)).rejects.toMatchObject({ digest: expect.stringContaining(`;/app?joined=${ws.id};`) })
    expect((await db.workspaceMember.findFirstOrThrow({ where: { userId: kemi.id } })).role).toBe('Viewer')
    expect(jar.set).toHaveBeenCalledWith('of_ws', ws.id, expect.anything())
  })

  it('Sign in as someone else signs out, leaves the workspace, and opens sign-in with the same link', async () => {
    await world('Viewer')
    const kemi = await mkUser('Kemi Balogun', 'kemi@x.test')
    signIn(kemi, 'w1')
    await signInAsSomeoneElseAction(TOKEN)
    expect(jar.delete).toHaveBeenCalledWith('of_ws')
    expect(signOut).toHaveBeenCalledWith({ redirectTo: `/sign-in?invite=${TOKEN}` })
    expect(jar.delete.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(signOut).mock.invocationCallOrder[0])
    // Nobody joined: the link still waits for whoever signs in next.
    expect(await validInvite(TOKEN)).not.toBeNull()
    expect(await db.workspaceMember.count({ where: { userId: kemi.id } })).toBe(0)
  })
})

describe('a new owner’s workspace while it waits for Global', () => {
  const layout = async () =>
    text(renderToStaticMarkup(await ConsoleLayout({ children: null })))
  const PENDING = `${SHELL.banner.pending.lead} ${SHELL.banner.pending.text}`

  it('Create workspace lands on its home, under the awaiting-approval banner', async () => {
    const nkem = await mkUser('Nkem Obi')
    signIn(nkem)
    await expect(createWorkspaceAction(null, form({ name: 'Brand Demo', type: 'Brand', country: 'NG' }))).rejects.toMatchObject({
      digest: expect.stringContaining(';/app;'),
    })
    const ws = await db.workspace.findFirstOrThrow({ where: { name: 'Brand Demo' } })
    expect(ws.status).toBe('pending')
    signIn(nkem, ws.id)
    expect(await layout()).toContain(PENDING)
  })

  it('the owner can invite while pending; whoever joins sees the banner too; approval lifts it for everyone', async () => {
    const nkem = await mkUser('Nkem Obi')
    const ws = await db.workspace.create({ data: { name: 'Brand Demo', type: 'Brand', country: 'NG', status: 'pending' } })
    await db.workspaceMember.create({ data: { userId: nkem.id, workspaceId: ws.id, role: 'Owner' } })
    signIn(nkem, ws.id)
    const sent = await inviteAction('kemi@x.test', 'Viewer')
    expect(sent).toMatchObject({ ok: true, role: 'Viewer' })

    const kemi = await mkUser('Kemi Balogun', 'kemi@x.test')
    const token = (await db.invitation.findFirstOrThrow({ where: { workspaceId: ws.id } })).token
    signIn(kemi)
    await expect(acceptInviteAction(token)).rejects.toMatchObject({ digest: expect.stringContaining(';/app?joined=') })
    signIn(kemi, ws.id)
    expect(await layout()).toContain(PENDING)

    const admin = await db.user.create({ data: { email: 'admin@x.test', name: 'Ada Admin', passwordHash: 'x', isGlobalAdmin: true } })
    await approveWorkspace(ws.id, admin.id)
    for (const who of [nkem, kemi]) {
      signIn(who, ws.id)
      expect(await layout()).not.toContain(SHELL.banner.pending.lead)
    }
  })
})
