import type { CampaignStatus, Country, Prisma } from '@prisma/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HomePage from '@/app/app/(console)/page'
import { pauseOrResume } from '@/components/campaign/PauseResume'
import { takeToast } from '@/components/shell/toast-store'
import { auth } from '@/lib/auth'
import { homeHref, homePills, parseHomeFilter, sectionTitle } from '@/lib/campaign-filters'
import { HOME } from '@/lib/copy-home'
import { db } from '@/lib/db'
import { hourIn } from '@/lib/format'

vi.mock('@/lib/auth', () => ({ auth: vi.fn(), signOut: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const jar = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => jar }))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => '/app',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

const at = (iso: string) => new Date(iso)
let seq = 0
const next = () => ++seq

// The page reads the clock itself; only Date is faked so Prisma's timers keep running.
function clock(iso: string) {
  if (!vi.isFakeTimers()) vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(at(iso))
}

const mkUser = (name: string, o: { isGlobalAdmin?: boolean; createdAt?: Date } = {}) =>
  db.user.create({ data: { email: `u${next()}@x.test`, name, passwordHash: 'x', ...o } })
const join = (userId: string, workspaceId: string, role: 'Owner' | 'Manager' | 'Viewer') =>
  db.workspaceMember.create({ data: { userId, workspaceId, role } })

// A workspace and its Owner, Tunde Okafor.
async function workspace(country: Country = 'NG', name = 'Kola Bright', o: Partial<Prisma.WorkspaceUncheckedCreateInput> = {}) {
  const ws = await db.workspace.create({ data: { name, type: 'Brand', country, status: 'approved', ...o } })
  const owner = await mkUser('Tunde Okafor', { createdAt: at('2026-01-01T00:00:00Z') })
  await join(owner.id, ws.id, 'Owner')
  return { ws, owner }
}

function mkCampaign(workspaceId: string, name: string, status: CampaignStatus, o: Partial<Prisma.CampaignUncheckedCreateInput> = {}) {
  return db.campaign.create({
    data: {
      workspaceId, name, brand: 'Kola Bright', country: 'NG', category: 'Food & drink', headline: `${name} headline`,
      description: 'd', placement: 'card', redeemMethod: 'code', budgetUsd: 100, shareRewardLabel: 'r', status,
      startsAt: at('2026-11-07T23:00:00Z'), endsAt: at('2026-11-21T23:00:00Z'), submittedAt: at('2026-11-05T09:00:00Z'),
      ...o,
    },
  })
}

// The session carries the user's name, as the sign-in puts it there.
function signIn(u: { id: string; name: string; isGlobalAdmin: boolean }, workspaceId: string) {
  vi.mocked(auth).mockResolvedValue({ user: { id: u.id, name: u.name, isGlobalAdmin: u.isGlobalAdmin }, expires: '' } as never)
  jar.get.mockImplementation((k: string) => (k === 'of_ws' ? { value: workspaceId } : undefined))
}

// The visible text, tags removed, so assertions read like the screen.
const text = (markup: string) =>
  markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&')

async function home(filter?: string | string[]) {
  const markup = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve(filter === undefined ? {} : { filter }) }))
  return { markup, text: text(markup) }
}

// [label, count] of every pill, in order.
const pills = (markup: string) => [...markup.matchAll(/class="pill"[^>]*>([^<]+)<i>(\d+)<\/i>/g)].map((m) => [m[1], Number(m[2])])
const pressed = (markup: string) => markup.match(/class="pill" aria-pressed="true">([^<]+)</)?.[1]
const cardLinks = (markup: string) => [...markup.matchAll(/<a class="cc" href="([^"]+)"/g)].map((m) => m[1])
const header = (t: string) => t.match(/(?:All campaigns|Live|In review|Paused|Ended|Scheduled|Rejected) \d+(?= )/g)?.at(-1)

beforeEach(() => {
  vi.clearAllMocks()
  takeToast()
})
afterEach(() => vi.useRealTimers())

describe('the filter vocabulary', () => {
  it('reads ?filter=, falling back to All for anything it does not know', () => {
    for (const f of ['all', 'live', 'review', 'paused', 'ended', 'scheduled', 'rejected'] as const) expect(parseHomeFilter(f)).toBe(f)
    for (const raw of [undefined, '', 'draft', 'LIVE', ['live'], 3]) expect(parseHomeFilter(raw)).toBe('all')
  })

  it('always shows five pills, and Scheduled and Rejected only when there are some', () => {
    const counts = { all: 4, live: 1, review: 1, paused: 0, ended: 2, scheduled: 0, rejected: 0 }
    expect(homePills(counts).map((p) => [p.label, p.count])).toEqual([
      ['All', 4], ['Live', 1], ['In review', 1], ['Paused', 0], ['Ended', 2],
    ])
    expect(homePills({ ...counts, all: 6, scheduled: 1, rejected: 1 }).map((p) => p.key)).toEqual([
      'all', 'live', 'review', 'paused', 'ended', 'scheduled', 'rejected',
    ])
  })

  it('links each pill and names each section', () => {
    expect(homeHref('all')).toBe('/app')
    expect(homeHref('review')).toBe('/app?filter=review')
    expect(sectionTitle('all')).toBe('All campaigns')
    expect(sectionTitle('review')).toBe('In review')
    expect(sectionTitle('scheduled')).toBe('Scheduled')
  })

  it('reads the hour in the market, not in UTC', () => {
    expect(hourIn(at('2026-11-14T23:30:00Z'), 'Africa/Lagos')).toBe(0)
    expect(hourIn(at('2026-11-14T09:00:00Z'), 'Africa/Nairobi')).toBe(12)
    expect([11, 12, 17, 18].map(HOME.greeting)).toEqual(['Good morning', 'Good afternoon', 'Good afternoon', 'Good evening'])
  })
})

describe('Campaigns home', () => {
  it("greets the Owner by first name for the hour in the workspace's market", async () => {
    const { ws, owner } = await workspace()
    signIn(owner, ws.id)
    // Lagos is UTC+1.
    const greetings: [string, string][] = [
      ['2026-11-14T08:00:00Z', 'Good morning, Tunde'],
      ['2026-11-14T13:00:00Z', 'Good afternoon, Tunde'],
      ['2026-11-14T19:00:00Z', 'Good evening, Tunde'],
      ['2026-11-14T10:59:00Z', 'Good morning, Tunde'],
      ['2026-11-14T11:00:00Z', 'Good afternoon, Tunde'],
      ['2026-11-14T17:00:00Z', 'Good evening, Tunde'],
      // 23:30 UTC is already 00:30 tomorrow in Lagos.
      ['2026-11-14T23:30:00Z', 'Good morning, Tunde'],
    ]
    for (const [iso, greeting] of greetings) {
      clock(iso)
      expect((await home()).markup).toContain(`<h1>${greeting}</h1>`)
    }
    const { text: t } = await home()
    expect(t).toContain('Kola Bright › Campaigns')
    expect(t).toContain('Everything this workspace is running on Phoenix. The one that matters most is at the top.')
  })

  it("uses the workspace's own market: noon in Nairobi is still morning in Lagos", async () => {
    const { ws, owner } = await workspace('KE', 'Pesa Link')
    signIn(owner, ws.id)
    clock('2026-11-14T09:00:00Z')
    expect((await home()).markup).toContain('<h1>Good afternoon, Tunde</h1>')
  })

  it('greets whoever is signed in by their own first name, not the workspace Owner', async () => {
    const { ws } = await workspace()
    const later = await mkUser('Ada Bello', { createdAt: at('2026-03-01T00:00:00Z') })
    await join(later.id, ws.id, 'Owner')
    const manager = await mkUser('Kemi Balogun')
    await join(manager.id, ws.id, 'Manager')
    const viewer = await mkUser('Chidi Nwosu')
    await join(viewer.id, ws.id, 'Viewer')
    const admin = await mkUser('Global Admin', { isGlobalAdmin: true })
    clock('2026-11-14T19:00:00Z')
    for (const [who, h1] of [[later, 'Ada'], [manager, 'Kemi'], [viewer, 'Chidi'], [admin, 'Global']] as const) {
      signIn(who, ws.id)
      const { markup } = await home()
      expect(markup).toContain(`<h1>Good evening, ${h1}</h1>`)
      expect(markup).not.toContain('Tunde')
    }
  })

  it('counts each pill and shows Scheduled and Rejected only when there are some', async () => {
    const { ws, owner } = await workspace()
    signIn(owner, ws.id)
    clock('2026-11-14T12:00:00Z')
    for (const s of ['live', 'review', 'paused', 'ended'] as const) await mkCampaign(ws.id, s, s)
    let { markup } = await home()
    expect(pills(markup)).toEqual([['All', 4], ['Live', 1], ['In review', 1], ['Paused', 1], ['Ended', 1]])
    expect(pressed(markup)).toBe('All')

    await mkCampaign(ws.id, 'scheduled', 'scheduled')
    await mkCampaign(ws.id, 'rejected', 'rejected')
    ;({ markup } = await home())
    expect(pills(markup)).toEqual([
      ['All', 6], ['Live', 1], ['In review', 1], ['Paused', 1], ['Ended', 1], ['Scheduled', 1], ['Rejected', 1],
    ])
    const scheduled = await home('scheduled')
    expect(pressed(scheduled.markup)).toBe('Scheduled')
    expect(header(scheduled.text)).toBe('Scheduled 1')
  })

  it('puts the hero first under All and leaves it out of the grid and the count', async () => {
    const { ws, owner } = await workspace()
    signIn(owner, ws.id)
    clock('2026-11-14T12:00:00Z')
    const live = await mkCampaign(ws.id, 'Buy 2 get 1', 'live', { submittedAt: at('2026-11-06T09:00:00Z') })
    const review = await mkCampaign(ws.id, 'Win a year', 'review', { submittedAt: at('2026-11-13T09:00:00Z') })
    const ended = await mkCampaign(ws.id, '15% off', 'ended', { submittedAt: at('2026-10-01T09:00:00Z') })

    const all = await home()
    expect(all.markup.match(/class="hero"/g)).toHaveLength(1)
    expect(header(all.text)).toBe('All campaigns 2')
    expect(cardLinks(all.markup)).toEqual([`/app/campaigns/${review.id}`, `/app/campaigns/${ended.id}`])
    // The hero is reached through Open campaign only.
    expect(all.markup.split(`href="/app/campaigns/${live.id}"`)).toHaveLength(2)
    // The grid ends with the dashed tile.
    expect(all.markup).toMatch(/<a class="cc new" href="\/app\/campaigns\/new">\+ New campaign<\/a><\/div>/)

    const lives = await home('live')
    expect(lives.markup).not.toContain('class="hero"')
    expect(header(lives.text)).toBe('Live 1')
    expect(cardLinks(lives.markup)).toEqual([`/app/campaigns/${live.id}`])
    expect(lives.markup).not.toContain('class="cc new"')

    const inReview = await home('review')
    expect(pressed(inReview.markup)).toBe('In review')
    expect(header(inReview.text)).toBe('In review 1')

    // A filter with nothing in it: its header and an empty grid, no empty-state copy.
    const paused = await home('paused')
    expect(header(paused.text)).toBe('Paused 0')
    expect(paused.markup).toContain('<div class="cards"></div>')
    expect(paused.text).not.toContain(HOME.empty.title)

    // Anything unknown, and a pill that is not shown, fall back to All.
    for (const f of ['bogus', 'scheduled', 'rejected', ['live', 'ended']]) {
      const page = await home(f)
      expect(pressed(page.markup)).toBe('All')
      expect(header(page.text)).toBe('All campaigns 2')
      expect(page.markup).toContain('class="hero"')
    }
  })

  it("a video campaign's card shows the clip at its first frame over the tile colour, under its pills", async () => {
    const { ws, owner } = await workspace()
    signIn(owner, ws.id)
    clock('2026-11-14T12:00:00Z')
    await mkCampaign(ws.id, 'Live one', 'live')
    const key = '0b6f2a8e-3c1d-4e5f-9a7b-1c2d3e4f5a6b.mp4'
    await mkCampaign(ws.id, 'Clip', 'review', { placement: 'video', creativeVideoKey: key, tileColor: '#2B5FD9' })
    const { markup } = await home()
    const card = markup.split('<a class="cc"').find((c) => c.includes('Clip headline'))!
    expect(card).toContain(
      `<div class="cv" style="background:#2B5FD9"><video src="/uploads/${key}#t=0.1" aria-label="The campaign&#x27;s video" muted="" playsInline="" preload="metadata"></video><span class="st st-review">In review</span>`,
    )
    expect(card).not.toContain('class="ph"')
  })

  it('a workspace with no campaigns shows the dashed tile above "Nothing on Phoenix yet"', async () => {
    const { ws, owner } = await workspace('GH', 'SunFresh Juices', { status: 'pending' })
    signIn(owner, ws.id)
    clock('2026-11-14T12:00:00Z')
    const { markup, text: t } = await home()
    expect(pills(markup)).toEqual([['All', 0], ['Live', 0], ['In review', 0], ['Paused', 0], ['Ended', 0]])
    expect(markup).not.toContain('class="hero"')
    expect(header(t)).toBe('All campaigns 0')
    expect(t).toContain('Nothing on Phoenix yet Create your first offer. It takes about five minutes.')
    expect(markup.indexOf('class="cc new"')).toBeGreaterThan(-1)
    expect(markup.indexOf('class="cc new"')).toBeLessThan(markup.indexOf('class="box empty"'))
  })

  it('the empty state offers "Invite your team" to whoever manages people, and to no one else', async () => {
    const { ws, owner } = await workspace('GH', 'SunFresh Juices', { status: 'pending' })
    clock('2026-11-14T12:00:00Z')
    const link = /<div class="box empty">[^]*?<a [^>]*href="\/app\/people\/invite"[^>]*>Invite your team<\/a>/
    signIn(owner, ws.id)
    expect((await home()).markup).toMatch(link)
    for (const role of ['Manager', 'Viewer'] as const) {
      const who = await mkUser(`${role} Person`)
      await join(who.id, ws.id, role)
      signIn(who, ws.id)
      const { markup } = await home()
      expect(markup).toContain('class="box empty"')
      expect(markup).not.toMatch(link)
      expect(markup).not.toContain('Invite your team')
    }
  })

  it("prints the hero's eyebrow, four stats and pace note from the stored rows", async () => {
    const { ws, owner } = await workspace()
    signIn(owner, ws.id)
    const phoenix = await db.channel.create({ data: { key: 'phoenix', name: 'Phoenix', apiKeyHash: 'h', isLive: true } })
    const c = await mkCampaign(ws.id, 'Buy 2 get 1 — November', 'live', {
      headline: 'Buy 2 bottles, get 1 free', placement: 'featured', budgetUsd: 300,
    })
    const events = (type: 'Impression' | 'Open', n: number, iso: string) =>
      db.channelEvent.createMany({
        data: Array.from({ length: n }, () => {
          const k = next()
          return { campaignId: c.id, channelId: phoenix.id, type, sessionId: `s${k}`, at: at(iso), dedupeKey: `e${k}` }
        }),
      })
    await events('Impression', 1800, '2026-11-10T10:00:00Z')
    // Today in Lagos began at 23:00 UTC on the 13th.
    await events('Impression', 3, '2026-11-13T23:30:00Z')
    await events('Impression', 597, '2026-11-14T07:00:00Z')
    await events('Open', 156, '2026-11-14T07:00:00Z')
    const link = (o: Partial<Prisma.ShareLinkUncheckedCreateInput>) =>
      db.shareLink.create({ data: { code: `L${next()}`, campaignId: c.id, channelId: phoenix.id, depth: 1, sharerType: 'Channel', ...o } })
    const shared = await link({ via: 'whatsapp', sharerSessionId: 'a' })
    await link({ via: 'sms', sharerSessionId: 'b' })
    await link({ via: 'x', sharerSessionId: 'c' })
    await link({ sharerSessionId: 'd' }) // minted, never sent: not a share
    await db.rewardPayout.createMany({
      data: (['sent', 'queued', 'blocked'] as const).map((status) => ({
        campaignId: c.id, workspaceId: ws.id, shareLinkId: shared.id, claimEventKey: `claim${next()}`, amountLocal: 50, amountCents: 350, status,
      })),
    })
    const charge = (kind: 'delivery' | 'reward', amountCents: number) =>
      db.ledgerEntry.create({ data: { workspaceId: ws.id, campaignId: c.id, kind, amountCents, at: at('2026-11-13T12:00:00Z'), description: 'x' } })
    await charge('delivery', -12_600)
    await charge('reward', -700)
    clock('2026-11-14T08:00:00Z')

    const { markup, text: t } = await home()
    expect(t).toContain('Live Nigeria · Featured tile · ends 22 Nov')
    expect(t).toContain('Buy 2 bottles, get 1 free Kola Bright · Buy 2 get 1 — November')
    expect(t).toContain('Impressions 2.4k 600 today')
    expect(t).toContain('Open rate 6.5% 156 opened')
    expect(t).toContain('Shares → claims 2 3 shared · $7 rewards')
    expect(t).toContain('Budget $167 left of $300')
    // Spend $133 of $300.
    expect(markup).toMatch(/class="pace"><span style="width:44\.33/)
    // 44% spent, 46% of the flight gone.
    expect(t).toContain('On pace.')
    expect(t).not.toContain('Simulate a day')
  })

  it('offers Pause on a live hero and Resume on a paused one, and neither to a Viewer', async () => {
    const { ws, owner } = await workspace()
    clock('2026-11-14T12:00:00Z')
    const c = await mkCampaign(ws.id, 'Buy 2 get 1', 'live')
    signIn(owner, ws.id)
    let { markup, text: t } = await home()
    expect(markup).toMatch(/<button[^>]* class="btn g lg"[^>]*>Pause<\/button>/)
    expect(markup).toContain(`<a class="btn d lg" href="/app/campaigns/${c.id}">Open campaign</a>`)
    expect(markup).toContain('<a class="btn p" href="/app/campaigns/new">+ New campaign</a>')
    expect(t).not.toContain('Resume')

    await db.campaign.update({ where: { id: c.id }, data: { status: 'paused' } })
    ;({ markup, text: t } = await home())
    expect(markup).toMatch(/<button[^>]* class="btn p lg"[^>]*>Resume<\/button>/)
    expect(t).toContain('Paused — not delivering. Resume any time.')
    expect(t).toContain('Paused Nigeria · Wall card · ends 22 Nov')
    // Paused by the daily job at the credit limit, it cannot be resumed "any time": the note says why and what lifts it.
    await db.campaign.update({ where: { id: c.id }, data: { pausedBy: 'credit' } })
    ;({ text: t } = await home())
    expect(t).toContain('Paused — credit limit reached. Resume once an invoice is paid or Global raises the limit.')
    expect(t).not.toContain('Resume any time.')
    await db.campaign.update({ where: { id: c.id }, data: { pausedBy: null } })

    const viewer = await mkUser('Kemi Balogun')
    await join(viewer.id, ws.id, 'Viewer')
    signIn(viewer, ws.id)
    for (const status of ['live', 'paused'] as const) {
      await db.campaign.update({ where: { id: c.id }, data: { status } })
      ;({ markup, text: t } = await home())
      expect(markup).not.toMatch(/>(Pause|Resume)<\/button>/)
      expect(markup).toContain('>Open campaign</a>')
      // Creating is not a Viewer's either (spec §6.2): no head button, no dashed tile.
      expect(markup).not.toContain('href="/app/campaigns/new"')
    }
  })

  it('words the hero by status: awaiting approval in review, starts on a date when scheduled', async () => {
    const { ws, owner } = await workspace()
    signIn(owner, ws.id)
    clock('2026-11-14T12:00:00Z')
    const review = await mkCampaign(ws.id, 'Win a year', 'review', { placement: 'video' })
    let { markup, text: t } = await home()
    expect(t).toContain('In review Nigeria · Video · awaiting approval')
    expect(t).toContain('Global reviews within one working day.')
    expect(markup).not.toMatch(/>(Pause|Resume)<\/button>/)

    await db.campaign.update({
      where: { id: review.id },
      data: { status: 'scheduled', startsAt: at('2026-11-15T23:00:00Z'), endsAt: at('2026-11-29T23:00:00Z') },
    })
    ;({ markup, text: t } = await home())
    expect(t).toContain('Scheduled Nigeria · Video · starts 16 Nov')
    expect(markup).toContain('<span class="note"></span>')
  })
})

describe('the hero buttons', () => {
  it('pause and resume, and say so', async () => {
    const { ws, owner } = await workspace()
    signIn(owner, ws.id)
    clock('2026-11-14T12:00:00Z')
    const c = await mkCampaign(ws.id, 'Buy 2 get 1', 'live')
    await pauseOrResume(c.id, 'live')
    expect(takeToast()?.message).toBe('Paused — leaves Phoenix within 15 minutes. Resume any time.')
    expect((await db.campaign.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('paused')
    await pauseOrResume(c.id, 'paused')
    expect(takeToast()?.message).toBe('Resumed — back on Phoenix within 15 minutes.')
    expect((await db.campaign.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('live')
  })

  it("can't resume over the credit limit, and says why", async () => {
    const { ws, owner } = await workspace('NG', 'Kola Bright', { creditLimitCents: 1000 })
    signIn(owner, ws.id)
    clock('2026-11-14T12:00:00Z')
    const c = await mkCampaign(ws.id, 'Buy 2 get 1', 'paused', { pausedBy: 'credit' })
    await pauseOrResume(c.id, 'paused')
    expect(takeToast()?.message).toBe("Can't resume — credit limit reached. Pay the open invoice or ask Global to raise the limit.")
    expect((await db.campaign.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('paused')
  })

  it('a Viewer is refused', async () => {
    const { ws } = await workspace()
    const viewer = await mkUser('Kemi Balogun')
    await join(viewer.id, ws.id, 'Viewer')
    signIn(viewer, ws.id)
    const c = await mkCampaign(ws.id, 'Buy 2 get 1', 'live')
    await expect(pauseOrResume(c.id, 'live')).rejects.toBe('FORBIDDEN')
    expect(takeToast()).toBeNull()
  })
})
