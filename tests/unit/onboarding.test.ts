import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signInAction } from '@/app/(auth)/sign-in/actions'
import SignInPage from '@/app/(auth)/sign-in/page'
import { signUpAction } from '@/app/(auth)/sign-up/actions'
import SignUpPage from '@/app/(auth)/sign-up/page'
import HomePage from '@/app/app/(console)/page'
import { acceptInviteAction, signInAsSomeoneElseAction } from '@/app/invite/[token]/actions'
import InvitePage from '@/app/invite/[token]/page'
import { auth, signIn as authSignIn, signOut } from '@/lib/auth'
import { INVITE_PAGE } from '@/lib/copy-people'
import { db } from '@/lib/db'
import { validInvite } from '@/lib/invitations'
import { hashPassword } from '@/lib/users'

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

// Prompt 4: an invite link leads to an account in the right workspace, with the role it names.

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

// The workspace keeps the cookie the actions write, as a browser would.
function keepCookie() {
  let ofWs: string | undefined
  jar.get.mockImplementation((k: string) => (k === 'of_ws' && ofWs ? { value: ofWs } : undefined))
  jar.set.mockImplementation((k: string, v: string) => {
    if (k === 'of_ws') ofWs = v
  })
  jar.delete.mockImplementation((k: string) => {
    if (k === 'of_ws') ofWs = undefined
  })
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

    it(`${name}: a link that can no longer be accepted shows the invite page's invalid view, with no form`, async () => {
      await world('Manager', { expiresAt: new Date(Date.now() - DAY) })
      for (const token of [TOKEN, 'nope']) {
        const html = await page(Page(search({ invite: token })))
        expect(text(html)).toContain(INVITE_PAGE.invalid)
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
    keepCookie()
    expect(await signUpAction(null, form({ name: 'Ada Obi', email: 'ada.other@x.test', password: 'password123', invite: TOKEN }))).toBeNull()
    const ada = await db.user.findUniqueOrThrow({ where: { email: 'ada.other@x.test' } })
    expect((await db.workspaceMember.findFirstOrThrow({ where: { userId: ada.id } })).role).toBe('Viewer')
    expect(jar.set).toHaveBeenCalledWith('of_ws', ws.id, expect.anything())
    expect(authSignIn).toHaveBeenCalledWith('credentials', expect.objectContaining({ redirectTo: `/app?joined=${ws.id}` }))
  })

  it('sign-in with an invite joins and lands on the home saying so', async () => {
    const { ws } = await world('Manager')
    const ada = await mkUser('Ada Obi', 'ada@x.test', 'right-password')
    signIn(null)
    keepCookie()
    expect(await signInAction(null, form({ email: 'ada@x.test', password: 'right-password', invite: TOKEN }))).toBeNull()
    expect((await db.workspaceMember.findFirstOrThrow({ where: { userId: ada.id } })).role).toBe('Manager')
    expect(authSignIn).toHaveBeenCalledWith('credentials', expect.objectContaining({ redirectTo: `/app?joined=${ws.id}` }))
  })

  it('a link that died before the form was sent joins nothing and lands on /app as before', async () => {
    await world('Manager', { revokedAt: new Date() })
    signIn(null)
    keepCookie()
    expect(await signUpAction(null, form({ name: 'Ada Obi', email: 'ada@x.test', password: 'password123', invite: TOKEN }))).toBeNull()
    expect(await db.workspaceMember.count({ where: { user: { email: 'ada@x.test' } } })).toBe(0)
    expect(authSignIn).toHaveBeenCalledWith('credentials', expect.objectContaining({ redirectTo: '/app' }))
  })

  it("the home says \"You've joined {workspace} as {role}.\" once, only for the workspace that was joined", async () => {
    const { ws } = await world()
    const ada = await mkUser('Ada Obi')
    await db.workspaceMember.create({ data: { userId: ada.id, workspaceId: ws.id, role: 'Viewer' } })
    signIn(ada, ws.id)
    const said = INVITE_PAGE.joined('Kola Bright', 'Viewer')
    expect(said).toBe("You've joined Kola Bright as Viewer.")
    expect(JSON.stringify(await HomePage(search({ joined: ws.id })))).toContain(said)
    expect(JSON.stringify(await HomePage(search({})))).not.toContain(said)
    expect(JSON.stringify(await HomePage(search({ joined: 'another-workspace' })))).not.toContain(said)
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

  it('a dead link says so and offers nothing, signed in or not', async () => {
    await world('Manager', { acceptedAt: new Date() })
    for (const who of [null, await mkUser('Kemi Balogun')]) {
      signIn(who)
      const html = await page(InvitePage({ params: Promise.resolve({ token: TOKEN }) }))
      expect(text(html)).toBe(INVITE_PAGE.invalid)
    }
  })

  it('Accept as {name} joins that account with the invited role and lands on the home saying so', async () => {
    const { ws } = await world('Viewer')
    const kemi = await mkUser('Kemi Balogun', 'kemi@x.test')
    signIn(kemi)
    keepCookie()
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
