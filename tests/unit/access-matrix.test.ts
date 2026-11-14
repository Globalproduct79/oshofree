import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setCreditLimitAction } from '@/app/admin/advertisers/actions'
import { requestCreditAction } from '@/app/app/(console)/billing/actions'
import { submitAction } from '@/app/app/(console)/campaigns/actions'
import ConsoleLayout from '@/app/app/(console)/layout'
import OrganisationPage from '@/app/app/(console)/organisation/page'
import HomePage from '@/app/app/(console)/page'
import { changeRoleAction, inviteAction, removeMemberAction } from '@/app/app/(console)/people/actions'
import { updateWorkspaceAction } from '@/app/app/(console)/workspace/actions'
import WorkspacePage from '@/app/app/(console)/workspace/page'
import { auth } from '@/lib/auth'
import { can, type Capability, type MemberRole } from '@/lib/capabilities'
import { db } from '@/lib/db'
import { tokens } from '@/lib/tokens'

vi.mock('@/lib/auth', () => ({ auth: vi.fn(), signOut: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const jar = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => jar }))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => '/app',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

// The access matrix (Prompt 4), in one table: for each role inside Kola Bright, what the sidebar offers, which
// head primaries it gets, and which server actions run for it or are refused — every row checked against can(),
// so the pages, the nav and the server agree with the one permission table.

const DAY = 86_400_000
const ROLES = ['Owner', 'Manager', 'Viewer', 'Global'] as const
type Role = (typeof ROLES)[number]
const Y = true
const N = false

// Kola Bright (Nigeria, approved, $1,500 credit) with Tunde as its Owner and Kemi as a Viewer for the people
// actions to act on; Phoenix rates and FX so a campaign can be submitted. The actor is Tunde, a new member with
// `role`, or Global inside the workspace.
async function world(role: Role) {
  const ws = await db.workspace.create({
    data: { name: 'Kola Bright', type: 'Brand', country: 'NG', status: 'approved', creditLimitCents: 150_000 },
  })
  const owner = await db.user.create({ data: { email: 'tunde@x.test', name: 'Tunde Okafor', passwordHash: 'x' } })
  await db.workspaceMember.create({ data: { userId: owner.id, workspaceId: ws.id, role: 'Owner' } })
  const kemi = await db.user.create({ data: { email: 'kemi@x.test', name: 'Kemi Balogun', passwordHash: 'x' } })
  await db.workspaceMember.create({ data: { userId: kemi.id, workspaceId: ws.id, role: 'Viewer' } })
  let actor = owner
  if (role !== 'Owner') {
    actor = await db.user.create({
      data: { email: 'actor@x.test', name: 'Ada Actor', passwordHash: 'x', isGlobalAdmin: role === 'Global' },
    })
    if (role !== 'Global') await db.workspaceMember.create({ data: { userId: actor.id, workspaceId: ws.id, role } })
  }
  const phoenix = await db.channel.create({ data: { key: 'phoenix', name: 'Phoenix', apiKeyHash: 'x', isLive: true } })
  const from = new Date(Date.now() - 60 * DAY)
  await db.rateCard.create({ data: { channelId: phoenix.id, country: 'NG', placement: 'card', cpmCents: 120, effectiveFrom: from } })
  await db.marketFx.create({ data: { country: 'NG', fxPerUsd: 1550, effectiveFrom: from } })
  vi.mocked(auth).mockResolvedValue({
    user: { id: actor.id, email: actor.email, name: actor.name, isGlobalAdmin: role === 'Global' },
    expires: '2099-01-01',
  } as never)
  jar.get.mockImplementation((k: string) => (k === 'of_ws' ? { value: ws.id } : undefined))
  return { ws, owner, kemi }
}
type World = Awaited<ReturnType<typeof world>>

const lagosDay = (at: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(at)
// A campaign as the New campaign form sends it, starting tomorrow.
const campaign = () => ({
  name: 'Easter bundle', brand: 'Kola Bright', country: 'NG', category: 'Food & drink',
  headline: 'Free 50cl with any 6-pack', description: 'Buy a 6-pack at any Shoprite and get a free 50cl bottle.',
  tileColor: tokens.tileColors[0], placement: 'card', redeemMethod: 'link', linkUrl: 'https://kolabright.example/easter',
  budgetUsd: 300, rewardLocal: 50, startsAt: lagosDay(Date.now() + DAY), runsForDays: 14, termsAccepted: true,
})
const form = (fields: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}
const role = async (w: World, userId: string) =>
  (await db.workspaceMember.findUnique({ where: { userId_workspaceId: { userId, workspaceId: w.ws.id } } }))?.role ?? null

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

// The head's orange primaries, by label.
function headPrimaries(markup: string): string[] {
  const head = element(markup, markup.indexOf('<div class="head">'))
  return [...head.matchAll(/<(a|button)\b[^>]*class="(btn[^"]*)"[^>]*>([^]*?)<\/\1>/g)]
    .filter((m) => m[2].split(' ').includes('p'))
    .map((m) => m[3].replace(/<[^>]+>/g, '').trim())
}
const render = async (node: Promise<React.ReactNode>) => renderToStaticMarkup(await node)

// ---- The sidebar ----

const WORKSPACE_NAV = [
  '/app', '/app/sharing', '/app/rewards', '/app/billing', '/app/invoices',
  '/app/organisation', '/app/people', '/app/workspace', '/app/notifications',
]
const PLATFORM_NAV = ['/admin/review', '/admin/advertisers', '/admin/rates', '/admin/settlement', '/admin/rewards', '/admin/api']

// What each role's sidebar links to, in order of appearance.
const NAV: Record<Role, { newCampaign: boolean; platform: boolean }> = {
  Owner: { newCampaign: Y, platform: N },
  Manager: { newCampaign: Y, platform: N },
  Viewer: { newCampaign: N, platform: N },
  Global: { newCampaign: Y, platform: Y },
}

// ---- The head primaries (and Workspace's Save, the form's own primary) ----

type Primary = { page: string; label: string; cap: Capability; render: () => Promise<string>; shown: (m: string) => boolean }
const PRIMARIES: (Primary & Record<Role, boolean>)[] = [
  {
    page: 'Home', label: '+ New campaign', cap: 'campaigns', Owner: Y, Manager: Y, Viewer: N, Global: Y,
    render: () => render(HomePage({ searchParams: Promise.resolve({}) })),
    shown: (m) => headPrimaries(m).includes('+ New campaign'),
  },
  {
    page: 'Organisation', label: 'Invite user', cap: 'people', Owner: Y, Manager: N, Viewer: N, Global: Y,
    render: () => render(OrganisationPage()),
    shown: (m) => headPrimaries(m).includes('Invite user'),
  },
  {
    page: 'Workspace', label: 'Save', cap: 'settings', Owner: Y, Manager: N, Viewer: N, Global: Y,
    render: () => render(WorkspacePage()),
    shown: (m) => /<button\b[^>]*class="btn p"[^>]*>Save<\/button>/.test(m),
  },
]

// ---- The server actions ----

type Action = {
  name: string
  // The capability requireMember asks for; null for Global's own Platform action (requireAdmin).
  cap: Capability | null
  run: (w: World) => Promise<unknown>
  // Whether it took effect.
  done: (w: World) => Promise<boolean>
}
const ACTIONS: (Action & Record<Role, boolean>)[] = [
  {
    name: 'createCampaign (New campaign › Submit)', cap: 'campaigns', Owner: Y, Manager: Y, Viewer: N, Global: Y,
    run: () => submitAction(campaign()),
    done: async (w) => (await db.campaign.count({ where: { workspaceId: w.ws.id, status: 'review' } })) === 1,
  },
  {
    name: 'invite', cap: 'people', Owner: Y, Manager: N, Viewer: N, Global: Y,
    run: () => inviteAction('new@x.test', 'Viewer'),
    done: async (w) => (await db.invitation.count({ where: { workspaceId: w.ws.id, email: 'new@x.test' } })) === 1,
  },
  {
    name: 'changeRole', cap: 'people', Owner: Y, Manager: N, Viewer: N, Global: Y,
    run: (w) => changeRoleAction(w.kemi.id, 'Manager'),
    done: async (w) => (await role(w, w.kemi.id)) === 'Manager',
  },
  {
    name: 'removeMember', cap: 'people', Owner: Y, Manager: N, Viewer: N, Global: Y,
    run: (w) => removeMemberAction(w.kemi.id),
    done: async (w) => (await role(w, w.kemi.id)) === null,
  },
  {
    name: 'updateWorkspace (Workspace › Save)', cap: 'settings', Owner: Y, Manager: N, Viewer: N, Global: Y,
    run: () => updateWorkspaceAction(null, form({ name: 'Kola Bright Ltd' })),
    done: async (w) => (await db.workspace.findUniqueOrThrow({ where: { id: w.ws.id } })).name === 'Kola Bright Ltd',
  },
  {
    name: 'requestCredit (Billing › Request a higher limit)', cap: 'requestCredit', Owner: Y, Manager: N, Viewer: N, Global: Y,
    run: () => requestCreditAction(),
    done: async (w) => (await db.creditRequest.count({ where: { workspaceId: w.ws.id } })) === 1,
  },
  {
    name: "setCreditLimit (Global's, on Advertisers)", cap: null, Owner: N, Manager: N, Viewer: N, Global: Y,
    run: (w) => setCreditLimitAction(w.ws.id, 2000),
    done: async (w) => (await db.workspace.findUniqueOrThrow({ where: { id: w.ws.id } })).creditLimitCents === 200_000,
  },
]

const allowedBy = (r: Role, cap: Capability | null) => (cap ? can(r as MemberRole, cap) : r === 'Global')

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('DEMO_CONTROLS', '0')
})
afterEach(() => vi.unstubAllEnvs())

describe('the access matrix', () => {
  it('agrees with can() in every row', () => {
    for (const r of ROLES) {
      expect(NAV[r].newCampaign, `nav New campaign for ${r}`).toBe(can(r, 'campaigns'))
      for (const p of PRIMARIES) expect(p[r], `${p.page} ${p.label} for ${r}`).toBe(can(r, p.cap))
      for (const a of ACTIONS) expect(a[r], `${a.name} for ${r}`).toBe(allowedBy(r, a.cap))
    }
  })

  for (const r of ROLES) {
    describe(r, () => {
      it(`sidebar: ${NAV[r].newCampaign ? 'with' : 'without'} New campaign${NAV[r].platform ? ', plus Platform' : ''}`, async () => {
        await world(r)
        const markup = renderToStaticMarkup(await ConsoleLayout({ children: null }))
        const nav = markup.slice(markup.indexOf('<nav'), markup.indexOf('</nav>'))
        const hrefs = [...nav.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
        const want = [...WORKSPACE_NAV]
        if (NAV[r].newCampaign) want.splice(1, 0, '/app/campaigns/new')
        if (NAV[r].platform) want.push(...PLATFORM_NAV)
        expect(hrefs).toEqual(want)
      })

      for (const p of PRIMARIES) {
        it(`${p.page}: ${p[r] ? 'shows' : 'hides'} ${p.label}`, async () => {
          await world(r)
          expect(p.shown(await p.render())).toBe(p[r])
        })
      }

      for (const a of ACTIONS) {
        it(`${a.name}: ${a[r] ? 'runs' : 'is refused'}`, async () => {
          const w = await world(r)
          if (a[r]) {
            const out = await a.run(w)
            expect(out && typeof out === 'object' && 'error' in out ? out : null).toBeNull()
            expect(await a.done(w)).toBe(true)
          } else {
            // A member is refused with FORBIDDEN; Global's Platform actions answer anyone else with a 404.
            if (a.cap) await expect(a.run(w)).rejects.toBe('FORBIDDEN')
            else await expect(a.run(w)).rejects.toMatchObject({ digest: expect.stringMatching(/NEXT_HTTP_ERROR_FALLBACK;404/) })
            expect(await a.done(w)).toBe(false)
          }
        })
      }
    })
  }
})
