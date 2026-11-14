import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OrganisationPage from '@/app/app/(console)/organisation/page'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { fd, longDate } from '@/lib/format'

vi.mock('@/lib/auth', () => ({ auth: vi.fn(), signOut: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const jar = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => jar }))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => '/app/organisation',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

// Organisation › Overview: the company, its team and who is still to join, with Invite user for those who manage
// people. No invite's link is ever sent to this page: only an invite or a resend hands one back, to who clicked.

const DAY = 86_400_000
const LAGOS = 'Africa/Lagos'
let seq = 0
type Role = 'Owner' | 'Manager' | 'Viewer'

const mkUser = (name: string, email = `u${++seq}@x.test`, isGlobalAdmin = false) =>
  db.user.create({ data: { email, name, passwordHash: 'x', isGlobalAdmin } })
function signIn(u: { id: string; name: string; isGlobalAdmin: boolean }, workspaceId: string) {
  vi.mocked(auth).mockResolvedValue({ user: { id: u.id, name: u.name, isGlobalAdmin: u.isGlobalAdmin }, expires: '' } as never)
  jar.get.mockImplementation((k: string) => (k === 'of_ws' ? { value: workspaceId } : undefined))
}

// Kola Bright (Nigeria, approved, $1,500 credit) with Tunde as Owner, Kemi as Manager, one open invite, one
// expired and one revoked.
async function world({ type = 'Brand' as 'Brand' | 'Agency', registrationNumber = 'RC 123456' as string | null } = {}) {
  const ws = await db.workspace.create({
    data: {
      name: 'Kola Bright', type, country: 'NG', status: 'approved', creditLimitCents: 150_000, registrationNumber,
      createdAt: new Date('2026-09-03T10:00:00Z'),
    },
  })
  const owner = await mkUser('Tunde Okafor', 'tunde@x.test')
  await db.workspaceMember.create({ data: { userId: owner.id, workspaceId: ws.id, role: 'Owner' } })
  const kemi = await mkUser('Kemi Balogun', 'kemi@x.test')
  await db.workspaceMember.create({ data: { userId: kemi.id, workspaceId: ws.id, role: 'Manager' } })
  const inv = (email: string, role: Role, expiresAt: Date, extra: { revokedAt?: Date } = {}) =>
    db.invitation.create({
      data: { workspaceId: ws.id, email, role, token: `${email[0]}`.repeat(32), invitedById: owner.id, expiresAt, ...extra },
    })
  const open = await inv('ada@x.test', 'Manager', new Date(Date.now() + 5 * DAY))
  const expired = await inv('bola@x.test', 'Viewer', new Date(Date.now() - 2 * DAY))
  const revoked = await inv('chi@x.test', 'Viewer', new Date(Date.now() + 5 * DAY), { revokedAt: new Date() })
  return { ws, owner, kemi, open, expired, revoked }
}
type World = Awaited<ReturnType<typeof world>>

async function as(w: World, who: Role | 'Global') {
  if (who === 'Owner') return signIn(w.owner, w.ws.id)
  if (who === 'Manager') return signIn(w.kemi, w.ws.id)
  if (who === 'Global') return signIn(await mkUser('Global Admin', 'admin@x.test', true), w.ws.id)
  const v = await mkUser('Vic Viewer', 'vic@x.test')
  await db.workspaceMember.create({ data: { userId: v.id, workspaceId: w.ws.id, role: 'Viewer' } })
  signIn(v, w.ws.id)
}

const text = (markup: string) =>
  markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').trim()
const titles = (markup: string) => [...markup.matchAll(/<h3>([^<]*)<\/h3>/g)].map((m) => m[1])
// The <a> to `href` with `label`, and its classes ('btn p' orange, 'btn g' white).
const linkClass = (markup: string, href: string, label: string) =>
  [...markup.matchAll(/<a\b([^>]*)>([^<]*)<\/a>/g)]
    .filter((m) => m[1].includes(`href="${href}"`) && m[2] === label)
    .map((m) => m[1].match(/class="([^"]*)"/)?.[1])
const render = async () => {
  const tree = await OrganisationPage()
  return { tree, html: renderToStaticMarkup(tree) }
}

beforeEach(() => vi.clearAllMocks())

describe('Organisation › Overview', () => {
  it('has the head the brief decided: crumb, title, lead and Invite user to the invite page', async () => {
    const w = await world()
    await as(w, 'Owner')
    const { html } = await render()
    expect(text(html)).toContain('Kola Bright › Organisation › Overview')
    expect(html).toContain('<h1>Organisation</h1>')
    expect(text(html)).toContain('Who you are on the platform, who works here, and who is still to join.')
    const acts = html.slice(html.indexOf('<div class="acts">'))
    expect(linkClass(acts.slice(0, acts.indexOf('</div>')), '/app/people/invite', 'Invite user')).toEqual(['btn p'])
  })

  it('shows Company, Team and Pending invitations, in that order', async () => {
    const w = await world()
    await as(w, 'Owner')
    expect(titles((await render()).html)).toEqual(['Company', 'Team', 'Pending invitations'])
  })

  it("states the company's facts, with Edit workspace for the Owner", async () => {
    const w = await world()
    await as(w, 'Owner')
    const { html } = await render()
    expect(text(html)).toContain(
      `Company Name Kola Bright Type Brand Country Nigeria Registration number RC 123456 Approval Approved ` +
        `Credit limit $1,500 Member since ${longDate(w.ws.createdAt, LAGOS)}`,
    )
    expect(longDate(w.ws.createdAt, LAGOS)).toBe('3 Sep 2026')
    expect(html).toContain('<span class="st st-approved">Approved</span>')
    expect(linkClass(html, '/app/workspace', 'Edit workspace')).toEqual(['btn g'])
    expect(text(html)).not.toContain('Client brands')
  })

  it('says a missing registration number is not given', async () => {
    const w = await world({ registrationNumber: null })
    await as(w, 'Owner')
    expect(text((await render()).html)).toContain('Registration number Not given')
  })

  it("lists an agency's client brands", async () => {
    const w = await world({ type: 'Agency' })
    const campaign = (brand: string) =>
      db.campaign.create({
        data: {
          workspaceId: w.ws.id, name: `C ${brand}`, brand, country: 'NG', category: 'Food & drink', headline: 'H',
          description: 'D', placement: 'card', redeemMethod: 'code', claimCode: 'X', budgetUsd: 100,
          startsAt: new Date(), endsAt: new Date(Date.now() + DAY), shareRewardLabel: 'R',
        },
      })
    await campaign('Indomie')
    await campaign('Indomie')
    await campaign('Peak Milk')
    await as(w, 'Owner')
    const t = text((await render()).html)
    expect(t).toContain('Type Agency')
    expect(t).toContain('Client brands Indomie · 2 campaigns Peak Milk · 1 campaign')
  })

  it('says when an agency has no client brands yet', async () => {
    const w = await world({ type: 'Agency' })
    await as(w, 'Owner')
    expect(text((await render()).html)).toContain('Client brands No client brands yet.')
  })

  it('lists every member with initials, email, role and who is you; the Owner gets the role select and Remove', async () => {
    const w = await world()
    await as(w, 'Owner')
    const { html } = await render()
    const t = text(html)
    expect(t).toContain('TO Tunde Okafor you tunde@x.test')
    expect(t).toContain('KB Kemi Balogun kemi@x.test')
    expect(t).not.toContain('Kemi Balogun you')
    expect(html).toContain('aria-label="Role for Kemi Balogun"')
    expect(html.match(/<select/g)).toHaveLength(2)
    expect(html.match(/>Remove</g)).toHaveLength(2)
    expect(html).toContain('title="The last Owner can&#x27;t be demoted."')
  })

  it('lists invites still to be taken up, expired ones included, with Resend and Revoke; never a link', async () => {
    const w = await world()
    await as(w, 'Owner')
    const { tree, html } = await render()
    const t = text(html)
    expect(t).toContain(
      `Pending invitations B bola@x.test Viewer · invited by Tunde Okafor · expired ${fd(w.expired.expiresAt, LAGOS)} Resend Revoke`,
    )
    expect(t).toContain(`A ada@x.test Manager · invited by Tunde Okafor · expires ${fd(w.open.expiresAt, LAGOS)} Resend Revoke`)
    expect(t).not.toContain('chi@x.test')
    for (const inv of [w.open, w.expired, w.revoked]) {
      expect(JSON.stringify(tree)).not.toContain(inv.token)
      expect(html).not.toContain(inv.token)
    }
    expect(html).not.toContain('/invite/')
    expect(html).not.toContain('>Copy<')
  })

  it('says no one is waiting to join when there are no invites', async () => {
    const w = await world()
    await db.invitation.deleteMany({ where: { workspaceId: w.ws.id } })
    await as(w, 'Owner')
    expect(text((await render()).html)).toContain('Pending invitations No one is waiting to join.')
  })

  it('gives a Viewer the facts, the team and the invites, and nothing to change them with', async () => {
    const w = await world()
    await as(w, 'Viewer')
    const { html } = await render()
    const t = text(html)
    expect(t).toContain('Vic Viewer you vic@x.test Viewer')
    expect(t).toContain('Tunde Okafor tunde@x.test Owner')
    expect(t).toContain('ada@x.test Manager · invited by Tunde Okafor')
    expect(html).not.toContain('<div class="acts">')
    for (const word of ['Invite user', 'Resend', 'Revoke', '>Copy<', '>Remove<', 'Edit workspace', '<select', '/app/people/invite']) {
      expect(html).not.toContain(word)
    }
  })

  it('gives a Manager no Invite user, Resend, Revoke or Edit workspace (only Owners and Global manage people)', async () => {
    const w = await world()
    await as(w, 'Manager')
    const { html } = await render()
    expect(text(html)).toContain('Kemi Balogun you kemi@x.test Manager')
    for (const word of ['Invite user', 'Resend', 'Revoke', 'Edit workspace', '<select']) expect(html).not.toContain(word)
  })

  it('gives Global inside the workspace Invite user, Edit workspace and the controls, and no "you"', async () => {
    const w = await world()
    await as(w, 'Global')
    const { html } = await render()
    expect(html).toContain('href="/app/people/invite"')
    expect(html).toContain('href="/app/workspace"')
    expect(html).toContain('Resend')
    expect(html).not.toContain('>you<')
  })
})
