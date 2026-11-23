import type { CampaignStatus, Prisma, RejectReason } from '@prisma/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changeWithoutReviewAction, endCampaignAction, moreActivityAction } from '@/app/app/(console)/campaigns/actions'
import CampaignPage from '@/app/app/(console)/campaigns/[id]/page'
import { saveChanges } from '@/components/campaign/ChangePanel'
import { endNow } from '@/components/campaign/EndCampaignModal'
import { takeToast } from '@/components/shell/toast-store'
import { auth } from '@/lib/auth'
import { approveCampaign, approveRevision, editOffer, rejectCampaign, rejectRevision, submitCampaign, type OfferFields } from '@/lib/campaigns'
import { previewOffer } from '@/lib/campaign-card'
import { db } from '@/lib/db'
import { localAmount } from '@/lib/format'

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

// The page and the actions read the clock themselves; only Date is faked so Prisma's timers keep running.
function clock(iso: string) {
  if (!vi.isFakeTimers()) vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(at(iso))
}

type Role = 'Owner' | 'Manager' | 'Viewer' | 'Global'

const mkUser = (name: string, isGlobalAdmin = false) =>
  db.user.create({ data: { email: `u${next()}@x.test`, name, passwordHash: 'x', isGlobalAdmin } })

// Kola Bright (Nigeria, approved, $1,500 limit) with its Owner, Phoenix with Nigerian rates and FX, and
// the actor signed in with `role` (Global from outside the workspace).
async function setup(role: Role = 'Owner', o: Partial<Prisma.WorkspaceUncheckedCreateInput> = {}) {
  const ws = await db.workspace.create({
    data: { name: 'Kola Bright', type: 'Brand', country: 'NG', status: 'approved', creditLimitCents: 150_000, ...o },
  })
  const owner = await mkUser('Tunde Okafor')
  await db.workspaceMember.create({ data: { userId: owner.id, workspaceId: ws.id, role: 'Owner' } })
  const admin = await mkUser('Global Admin', true)
  let actor = owner
  if (role === 'Global') actor = admin
  else if (role !== 'Owner') {
    actor = await mkUser('Kemi Balogun')
    await db.workspaceMember.create({ data: { userId: actor.id, workspaceId: ws.id, role } })
  }
  const phoenix = await db.channel.create({ data: { key: 'phoenix', name: 'Phoenix', apiKeyHash: 'h', isLive: true } })
  const from = at('2026-09-01T00:00:00Z')
  await db.rateCard.createMany({
    data: [
      { channelId: phoenix.id, country: 'NG', placement: 'card', cpmCents: 120, effectiveFrom: from },
      { channelId: phoenix.id, country: 'NG', placement: 'featured', cpmCents: 220, effectiveFrom: from },
    ],
  })
  await db.marketFx.create({ data: { country: 'NG', fxPerUsd: 1550, effectiveFrom: from } })
  vi.mocked(auth).mockResolvedValue({ user: { id: actor.id, isGlobalAdmin: role === 'Global' }, expires: '' } as never)
  jar.get.mockImplementation((k: string) => (k === 'of_ws' ? { value: ws.id } : undefined))
  return { ws, owner, admin, actor, phoenix }
}

// "Buy 2 get 1 — November": a featured tile, 8 Nov – 22 Nov in Lagos, $300, ₦50 a share.
function mkCampaign(workspaceId: string, status: CampaignStatus, o: Partial<Prisma.CampaignUncheckedCreateInput> = {}) {
  return db.campaign.create({
    data: {
      workspaceId, name: 'Buy 2 get 1 — November', brand: 'Kola Bright', country: 'NG', category: 'Food & drink',
      headline: 'Buy 2 bottles, get 1 free', description: 'Buy any two 50cl Kola Bright at a participating store and get a third free.',
      placement: 'featured', redeemMethod: 'code', budgetUsd: 300, rewardLocal: 50, shareRewardLabel: 'Earn ₦50 airtime',
      status, cpmCents: 220, fxPerUsd: 1550,
      startsAt: at('2026-11-07T23:00:00Z'), endsAt: at('2026-11-21T23:00:00Z'), submittedAt: at('2026-11-05T09:00:00Z'),
      ...o,
    },
  })
}

const charge = (workspaceId: string, campaignId: string, kind: 'delivery' | 'reward', amountCents: number) =>
  db.ledgerEntry.create({ data: { workspaceId, campaignId, kind, amountCents, at: at('2026-11-13T12:00:00Z'), description: 'x' } })

// The visible text, tags removed, so assertions read like the screen.
const text = (markup: string) =>
  markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"')

async function page(id: string, search?: Record<string, string>) {
  const markup = renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve(search ?? {}) }))
  return { markup, text: text(markup) }
}

const button = (markup: string, label: string) => markup.match(new RegExp(`<button[^>]*>${label}</button>`))?.[0]
const chartSub = (markup: string) => markup.match(/<h3>Impressions per day<\/h3><p class="sub">([^<]*)<\/p>/)?.[1]
const statusLine = (t: string) => t.match(/(?:Live|Paused|In review|Scheduled|Rejected|Ended) (?:[^ ]+ ){0,20}?(?=Impressions )/)?.[0].trim()

beforeEach(() => {
  vi.clearAllMocks()
  takeToast()
})
afterEach(() => vi.useRealTimers())

describe('the campaign page head', () => {
  it('reads "{workspace} › Campaigns › {name}", the headline, and brand · country · placement · dates', async () => {
    const { ws } = await setup()
    clock('2026-11-14T08:00:00Z')
    const c = await mkCampaign(ws.id, 'live')
    const { markup, text: t } = await page(c.id)
    expect(t).toContain('Kola Bright › Campaigns › Buy 2 get 1 — November')
    expect(markup).toContain('<a href="/app">Campaigns</a>')
    expect(markup).toContain('<h1>Buy 2 bottles, get 1 free</h1>')
    expect(t).toContain('Kola Bright · Nigeria · Featured tile · 8 Nov – 22 Nov')
  })

  // ADV §2 "Per-status differences", with the rejected chart sub fixed (spec §6.8).
  const TABLE: [CampaignStatus, string | null, string][] = [
    ['live', 'Pause', '$300 left over 8 days.'],
    ['paused', 'Resume', 'Paused — not delivering.'],
    ['review', null, 'Starts once approved.'],
    ['scheduled', null, 'Scheduled.'],
    ['rejected', null, 'Not approved.'],
    ['ended', null, 'Finished.'],
  ]

  it.each(TABLE)('a %s campaign: its head actions and chart sub-line', async (status, control, sub) => {
    const { ws } = await setup()
    clock('2026-11-14T08:00:00Z')
    const c = await mkCampaign(ws.id, status, { rejectReasonCode: status === 'rejected' ? 'misleading_terms' : null })
    const { markup } = await page(c.id)
    const acts = markup.match(/<div class="acts">(.*?)<\/div><\/div>/)?.[1] ?? ''
    if (control === 'Pause') expect(acts).toMatch(/<button[^>]*class="btn g"[^>]*>Pause<\/button>/)
    if (control === 'Resume') expect(acts).toMatch(/<button[^>]*class="btn p"[^>]*>Resume<\/button>/)
    if (control !== 'Pause') expect(acts).not.toContain('>Pause</button>')
    if (control !== 'Resume') expect(acts).not.toContain('>Resume</button>')
    expect(acts).toMatch(/<button[^>]*class="btn g"[^>]*>See it on Phoenix<\/button>/)
    expect(acts).toMatch(/<a class="btn d" href="\/app">← Campaigns<\/a>$/)
    expect(chartSub(markup)).toBe(sub)
  })

  it('offers no Pause or Resume to a Viewer', async () => {
    const { ws } = await setup('Viewer')
    clock('2026-11-14T08:00:00Z')
    const c = await mkCampaign(ws.id, 'live')
    for (const status of ['live', 'paused'] as const) {
      await db.campaign.update({ where: { id: c.id }, data: { status } })
      const { markup } = await page(c.id)
      expect(markup).not.toMatch(/>(Pause|Resume)<\/button>/)
      expect(markup).toContain('>See it on Phoenix</button>')
    }
  })

  it("is another workspace's campaign: not found", async () => {
    await setup()
    const other = await db.workspace.create({ data: { name: 'Rival', type: 'Brand', country: 'NG', status: 'approved' } })
    const c = await mkCampaign(other.id, 'live')
    await expect(page(c.id)).rejects.toThrow()
  })

  // Prompt 10's sweep: Global opening a campaign's address outside its workspace (a card opened in a new tab, a pasted
  // link) found a 404. It is told which workspace the campaign is in, with the audited way in; nothing else is shown.
  it("for Global, another workspace's campaign says where it is and enters that workspace on a press", async () => {
    await setup('Global')
    clock('2026-11-14T08:00:00Z')
    const other = await db.workspace.create({ data: { name: 'Rival Foods', type: 'Brand', country: 'NG', status: 'approved' } })
    const c = await mkCampaign(other.id, 'live')
    const { markup, text: t } = await page(c.id)
    // Its own workspace in the breadcrumb, not the one Global is in.
    expect(markup).toContain('<div class="crumb">Rival Foods › <span>Buy 2 get 1 — November</span></div>')
    expect(markup).toContain('<h1>Buy 2 bottles, get 1 free</h1>')
    expect(t).toContain('This campaign is in Rival Foods. Enter Rival Foods to open it there.')
    expect(markup).toMatch(/<form action="[^"]*"><button class="btn p" type="submit">Enter Rival Foods<\/button><\/form>/)
    // None of the campaign's report reaches the page before Global enters.
    expect(t).not.toContain('Impressions')
    expect(t).not.toContain('Recent activity')
  })

  it("for Global, a campaign that does not exist anywhere is still not found", async () => {
    await setup('Global')
    await expect(page('no-such-campaign')).rejects.toThrow()
  })
})

describe('the status line', () => {
  it('in review: grey "Global usually decides within one working day"', async () => {
    const { ws } = await setup()
    clock('2026-11-14T08:00:00Z')
    const c = await mkCampaign(ws.id, 'review')
    const { markup, text: t } = await page(c.id)
    expect(statusLine(t)).toBe('In review Global usually decides within one working day')
    expect(markup).toContain('<span class="note">Global usually decides within one working day</span>')
  })

  it('rejected: the red "{code label}: {note}", or the label alone without a note', async () => {
    const { ws } = await setup()
    clock('2026-11-14T08:00:00Z')
    const c = await mkCampaign(ws.id, 'rejected', {
      rejectReasonCode: 'misleading_terms', rejectReason: 'Say where the offer can be redeemed.',
    })
    const { markup, text: t } = await page(c.id)
    expect(statusLine(t)).toBe('Rejected Misleading or unclear terms: Say where the offer can be redeemed.')
    expect(markup).toContain('<span class="note bad">Misleading or unclear terms: Say where the offer can be redeemed.</span>')

    await db.campaign.update({ where: { id: c.id }, data: { rejectReasonCode: 'not_available', rejectReason: null } })
    expect(statusLine((await page(c.id)).text)).toBe('Rejected Not available in market')
  })

  it('paused at the credit limit: red, saying why it stopped and what lets it resume; paused by the advertiser: nothing', async () => {
    const { ws } = await setup()
    clock('2026-11-14T08:00:00Z')
    const c = await mkCampaign(ws.id, 'paused', { pausedBy: 'credit' })
    const { markup, text: t } = await page(c.id)
    expect(statusLine(t)).toBe('Paused · credit limit reached — Resume once an invoice is paid or Global raises the limit')
    expect(markup).toContain('<span class="note bad">· credit limit reached — Resume once an invoice is paid or Global raises the limit</span>')

    await db.campaign.update({ where: { id: c.id }, data: { pausedBy: 'user' } })
    expect((await page(c.id)).markup).not.toContain('class="note')
  })

  it('live, scheduled and ended campaigns have nothing after the badge', async () => {
    const { ws } = await setup()
    clock('2026-11-14T08:00:00Z')
    for (const status of ['live', 'scheduled', 'ended', 'paused'] as const) {
      const c = await mkCampaign(ws.id, status)
      const { markup } = await page(c.id)
      expect(markup).not.toContain('class="note')
    }
  })

  it('names a revised offer in review, and one Global turned down (spec §6.14.3)', async () => {
    const { ws, owner, admin } = await setup()
    clock('2026-11-14T08:00:00Z')
    const c = await mkCampaign(ws.id, 'live')
    const offer: OfferFields = {
      brand: 'Kola Bright', category: 'Food & drink', headline: 'Buy 3 bottles, get 2 free', description: 'Any stand.',
      tileColor: '', placement: 'featured', redeemMethod: 'code', ageGated: false,
    }
    const { revision } = await editOffer(c.id, owner.id, offer, at('2026-11-13T09:00:00Z'))
    let { markup, text: t } = await page(c.id)
    expect(statusLine(t)).toBe('Live · a revised offer is in review')
    expect(markup).toContain('<span class="note">· a revised offer is in review</span>')
    // The live version keeps running: the page still shows it.
    expect(markup).toContain('<h1>Buy 2 bottles, get 1 free</h1>')

    await db.campaign.update({ where: { id: c.id }, data: { status: 'paused' } })
    ;({ text: t } = await page(c.id))
    expect(statusLine(t)).toBe('Paused · a revised offer is in review')
    // Paused at the credit limit with a revision waiting: both, the credit first, in red.
    await db.campaign.update({ where: { id: c.id }, data: { pausedBy: 'credit' } })
    expect((await page(c.id)).markup).toContain(
      '<span class="note bad">· credit limit reached — Resume once an invoice is paid or Global raises the limit · a revised offer is in review</span>',
    )
    await db.campaign.update({ where: { id: c.id }, data: { pausedBy: null } })

    await db.campaign.update({ where: { id: c.id }, data: { status: 'live' } })
    await rejectRevision(revision!.id, admin.id, 'broken_link', 'The link 404s.', at('2026-11-13T10:00:00Z'))
    ;({ markup, text: t } = await page(c.id))
    expect(statusLine(t)).toBe('Live · revised offer not approved: Broken or unsafe link: The link 404s.')
    expect(markup).toContain('<span class="note bad">· revised offer not approved: Broken or unsafe link: The link 404s.</span>')

    // Approving the next one clears the line.
    const second = await editOffer(c.id, owner.id, offer, at('2026-11-13T11:00:00Z'))
    await approveRevision(second.revision!.id, admin.id, at('2026-11-13T12:00:00Z'))
    ;({ markup } = await page(c.id))
    expect(markup).not.toContain('class="note')
  })
})

describe('the numbers', () => {
  // The home hero's fixture (Task 18): 2,400 impressions (600 today in Lagos), 156 opens, 50 claims,
  // three sent shares and a minted one, two successful friend claims, $126 delivery and $7 rewards.
  async function delivered(redeemMethod: 'code' | 'link' = 'code') {
    const { ws, phoenix } = await setup()
    const c = await mkCampaign(ws.id, 'live', { redeemMethod })
    const events = (type: 'Impression' | 'Open' | 'Claim', n: number, iso: string) =>
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
    await events('Claim', 50, '2026-11-14T07:00:00Z')
    const consumer = await db.consumer.create({ data: { phone: '+2348012344471', country: 'NG' } })
    const link = (o: Partial<Prisma.ShareLinkUncheckedCreateInput>) =>
      db.shareLink.create({ data: { code: `L${next()}`, campaignId: c.id, channelId: phoenix.id, depth: 1, sharerType: 'Channel', ...o } })
    const shared = await link({ via: 'whatsapp', sharerType: 'Consumer', consumerId: consumer.id })
    await link({ via: 'sms', sharerSessionId: 'b' })
    await link({ via: 'x', sharerSessionId: 'c' })
    await link({ sharerSessionId: 'd' }) // minted, never sent: not a share
    await db.linkEvent.createMany({
      data: Array.from({ length: 4 }, () => ({
        linkId: shared.id, type: 'Open' as const, visitorId: `v${next()}`, ipHash: 'i', userAgent: 'u', at: at('2026-11-14T07:00:00Z'),
      })),
    })
    await db.rewardPayout.createMany({
      data: (['sent', 'queued', 'blocked'] as const).map((status) => ({
        campaignId: c.id, workspaceId: ws.id, shareLinkId: shared.id, sharerConsumerId: consumer.id,
        // ₦5,426 at ₦1,550 to the dollar is 350 cents (₦5,425 back again): the page sums the stored airtime.
        claimEventKey: `claim${next()}`, amountLocal: 5426, amountCents: 350, status,
      })),
    })
    await charge(ws.id, c.id, 'delivery', -12_600)
    await charge(ws.id, c.id, 'reward', -700)
    clock('2026-11-14T08:00:00Z')
    return { ws, c }
  }

  it('prints the KPI row from the stored rows', async () => {
    const { c } = await delivered()
    const { markup, text: t } = await page(c.id)
    expect(t).toContain('Impressions 2.4k 600 today')
    expect(t).toContain('Open rate 6.5% 156 opened')
    // $133 spent (rewards included) over 50 claims.
    expect(t).toContain('Claim codes 50 $2.66 each')
    expect(t).toContain('Spent $133 of $300 · $7 in rewards')
    const fills = [...markup.matchAll(/<div class="ln"><i style="width:([\d.]+)%"><\/i>/g)].map((m) => Number(m[1]))
    // Spend ÷ budget, open rate ÷ 10%, claims ÷ opens, spend ÷ budget; then the Sharing cards.
    expect(fills.slice(0, 4).map((f) => f.toFixed(2))).toEqual(['44.33', '65.00', '32.05', '44.33'])
    expect(chartSub(markup)).toBe('$167 left over 8 days.')

    // Cost per claim follows the money rule: a whole dollar stays whole, thousands are grouped.
    const charge = (cents: number) => db.ledgerEntry.create({ data: { workspaceId: c.workspaceId, campaignId: c.id, kind: 'delivery', amountCents: -cents, description: 'd' } })
    await charge(36_700) // $500 over 50 claims
    expect((await page(c.id)).text).toContain('Claim codes 50 $10 each')
    await charge(5_000_000) // $50,500 over 50 claims
    expect((await page(c.id)).text).toContain('Claim codes 50 $1,010 each')
  })

  it('names the claims "Clicks to you" when the offer sends people to a link', async () => {
    const { c } = await delivered('link')
    const { text: t } = await page(c.id)
    expect(t).toContain('Clicks to you 50 $2.66 each')
    expect(t).toContain('Clicked to your site 50')
    expect(t).not.toContain('Claim codes')
  })

  it('draws the funnel against impressions', async () => {
    const { c } = await delivered()
    const { markup, text: t } = await page(c.id)
    expect(t).toContain('What consumers did Saw the card 2.4k Opened it 156 Took a claim code 50 Shared it 3 Friend claimed 2')
    const widths = [...markup.matchAll(/<span class="fb" style="width:([\d.]+)%"><\/span>/g)].map((m) => Number(m[1]))
    expect(widths.map((w) => w.toFixed(2))).toEqual(['50.00', '3.25', '2.00', '2.00', '2.00'])
  })

  it('fills the Sharing box: sentence, four cards, where it was shared and who', async () => {
    const { c } = await delivered()
    const { markup, text: t } = await page(c.id)
    expect(t).toContain(
      'Sharing A sharer earns ₦50 airtime and 10 points when a friend opens their link and claims. Capped at 20% of budget.',
    )
    expect(t).toContain('Shares 3 from 156 opens')
    // Friend opens ÷ opens.
    expect(t).toContain('Friends opened 4 viral coefficient 0.03')
    expect(t).toContain('Friends claimed 2 50.0% of opens')
    // The sent and queued payouts' stored airtime (2 × ₦5,426), not their $7 converted back at ₦1,550 (₦10,850).
    expect(t).toContain('Rewards paid $7 ₦10,852 airtime')
    expect(t).toContain('Where it was shared WhatsApp 1 X 1 Facebook 0 SMS 1')
    expect(t).toContain('Top sharers (anonymised) 1 +234 80• ••• 4471 2 claims')
    // The grid wraps instead of overflowing at 390 px (ADV §16).
    expect(markup).toContain('<div class="mgrid m4">')
    expect(markup).not.toContain('repeat(4')
  })

  it('takes the points from the workspace and the reward and cap from the campaign', async () => {
    const { ws } = await setup('Owner', { pointsPerShare: 15 })
    clock('2026-11-14T08:00:00Z')
    const c = await mkCampaign(ws.id, 'live', { rewardLocal: 1000, rewardCapPct: 10 })
    const { text: t } = await page(c.id)
    expect(t).toContain('A sharer earns ₦1,000 airtime and 15 points when a friend opens their link and claims. Capped at 10% of budget.')
    expect(localAmount(10, 'KE')).toBe('KSh10')
  })

  it('shows zeros for a campaign that never delivered (ADV §2)', async () => {
    const { ws } = await setup()
    clock('2026-11-14T08:00:00Z')
    // In review, never submitted before: no FX snapshot either.
    const c = await mkCampaign(ws.id, 'review', { budgetUsd: 100, fxPerUsd: null, cpmCents: null })
    await db.marketFx.deleteMany()
    const { markup, text: t } = await page(c.id)
    expect(t).toContain('Impressions 0 0 today')
    expect(t).toContain('Open rate 0% 0 opened')
    expect(t).toContain('Claim codes 0 —')
    expect(t).toContain('Spent $0 of $100 · $0 in rewards')
    expect(t).toContain('Shares 0 from 0 opens')
    expect(t).toContain('Friends opened 0 viral coefficient 0.00')
    expect(t).toContain('Friends claimed 0 0% of opens')
    expect(t).toContain('Rewards paid $0 ₦0 airtime')
    expect(t).toContain('Where it was shared WhatsApp 0 X 0 Facebook 0 SMS 0')
    expect(t).toContain('Top sharers (anonymised) No shares yet.')
    const widths = [...markup.matchAll(/<span class="fb" style="width:([\d.]+)%"><\/span>/g)].map((m) => m[1])
    expect(widths).toEqual(['2', '2', '2', '2', '2'])
    expect(markup).not.toContain('NaN')
  })
})

describe('Change without review', () => {
  const field = (markup: string, label: string) =>
    markup.match(new RegExp(`<label>${label.replace(/[()]/g, '\\$&')}<input([^>]*)/?>`))?.[1] ?? ''

  it('is prefilled: budget (min = spend, step 10), the market-local end date, the reward in local currency', async () => {
    const { ws } = await setup()
    const c = await mkCampaign(ws.id, 'live')
    await charge(ws.id, c.id, 'delivery', -13_350)
    clock('2026-11-14T08:00:00Z')
    const { markup, text: t } = await page(c.id)
    expect(t).toContain('Change without review Money and timing. Applied within 15 minutes.')
    expect(field(markup, 'Budget (USD)')).toMatch(/type="number" min="134" step="10" value="300"/)
    // 22 Nov at midnight in Lagos: the date the hero and lead print.
    expect(field(markup, 'End date')).toMatch(/type="date" value="2026-11-22"/)
    expect(field(markup, 'Share reward (NGN airtime per successful share)')).toMatch(/type="number" min="0" step="5" value="50"/)
  })

  const SAVE: [CampaignStatus, boolean, boolean][] = [
    ['live', true, true],
    ['paused', true, true],
    ['review', true, false],
    ['scheduled', true, false],
    ['rejected', false, false],
    ['ended', false, false],
  ]

  it.each(SAVE)('a %s campaign: Save enabled %s, End campaign now shown %s', async (status, saves, ends) => {
    const { ws } = await setup()
    clock('2026-11-14T08:00:00Z')
    const c = await mkCampaign(ws.id, status)
    const { markup } = await page(c.id)
    const save = button(markup, 'Save changes')
    expect(save).toMatch(/class="btn p"/)
    expect(save?.includes('disabled=""')).toBe(!saves)
    const end = button(markup, 'End campaign now')
    if (ends) expect(end).toMatch(/class="btn g" style="color:#C53030"/)
    else expect(end).toBeUndefined()
  })

  it('is read-only to a Viewer, and The offer has no edit button', async () => {
    const { ws } = await setup('Viewer')
    clock('2026-11-14T08:00:00Z')
    const c = await mkCampaign(ws.id, 'live')
    const { markup, text: t } = await page(c.id)
    expect(t).toContain('Change without review')
    for (const label of ['Budget (USD)', 'End date', 'Share reward (NGN airtime per successful share)'])
      expect(field(markup, label)).toContain('disabled=""')
    expect(button(markup, 'Save changes')).toBeUndefined()
    expect(button(markup, 'End campaign now')).toBeUndefined()
    expect(markup).not.toContain('Edit offer and resubmit')
  })

  it('saves budget, end date and reward and says so', async () => {
    const { ws } = await setup()
    const c = await mkCampaign(ws.id, 'live')
    await charge(ws.id, c.id, 'delivery', -13_300)
    clock('2026-11-14T08:00:00Z')
    await saveChanges(c.id, { budgetUsd: '350', endsAt: '2026-11-25', rewardLocal: '60' })
    expect(takeToast()?.message).toBe('Saved — live within 15 minutes, no review needed')
    const row = await db.campaign.findUniqueOrThrow({ where: { id: c.id } })
    expect(row).toMatchObject({ budgetUsd: 350, rewardLocal: 60, shareRewardLabel: 'Earn ₦60 airtime', status: 'live' })
    // Midnight in Lagos on the 25th.
    expect(row.endsAt).toEqual(at('2026-11-24T23:00:00Z'))
    const { markup, text: t } = await page(c.id)
    expect(chartSub(markup)).toBe('$217 left over 11 days.')
    expect(t).toContain('A sharer earns ₦60 airtime')
  })

  it("refuses a budget below spend and one over the credit limit, and changes nothing", async () => {
    const { ws } = await setup()
    const c = await mkCampaign(ws.id, 'live')
    await charge(ws.id, c.id, 'delivery', -13_300)
    clock('2026-11-14T08:00:00Z')
    const same = { endsAt: '2026-11-22', rewardLocal: 50 }
    expect(await changeWithoutReviewAction(c.id, { ...same, budgetUsd: 100 })).toEqual({
      error: "Budget can't be below what's already spent",
    })
    // $300 in use ($133 unbilled + $167 committed); +$1,400 would make $1,700.
    expect(await changeWithoutReviewAction(c.id, { ...same, budgetUsd: 1700 })).toEqual({
      error: 'That would exceed your credit limit of $1,500',
    })
    await saveChanges(c.id, { budgetUsd: '1700', endsAt: '2026-11-22', rewardLocal: '50' })
    expect(takeToast()?.message).toBe('That would exceed your credit limit of $1,500')
    expect((await db.campaign.findUniqueOrThrow({ where: { id: c.id } })).budgetUsd).toBe(300)
    // Exactly at the limit is allowed.
    expect(await changeWithoutReviewAction(c.id, { ...same, budgetUsd: 1500 })).toEqual({
      ok: true, toast: 'Saved — live within 15 minutes, no review needed',
    })
  })

  it("refuses a draft's budget too large to store, and changes nothing", async () => {
    const { ws } = await setup()
    const c = await mkCampaign(ws.id, 'draft')
    clock('2026-11-14T08:00:00Z')
    expect(await changeWithoutReviewAction(c.id, { budgetUsd: '3000000000', endsAt: '2026-11-22', rewardLocal: 50 })).toEqual({
      error: 'That budget is too large.',
    })
    expect((await db.campaign.findUniqueOrThrow({ where: { id: c.id } })).budgetUsd).toBe(300)
  })

  it('refuses a reward too large to store, and changes nothing', async () => {
    const { ws } = await setup()
    const c = await mkCampaign(ws.id, 'live')
    clock('2026-11-14T08:00:00Z')
    expect(await changeWithoutReviewAction(c.id, { budgetUsd: '300', endsAt: '2026-11-22', rewardLocal: '21474837' })).toEqual({
      error: 'That reward is too large.',
    })
    expect(await db.campaign.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ rewardLocal: 50, shareRewardLabel: 'Earn ₦50 airtime' })
  })

  it('refuses an end date before the start or already past, and a rejected or ended campaign', async () => {
    const { ws } = await setup()
    const c = await mkCampaign(ws.id, 'live')
    clock('2026-11-14T08:00:00Z')
    const res = await changeWithoutReviewAction(c.id, { budgetUsd: 300, endsAt: '2026-11-10', rewardLocal: 50 })
    expect(res).toEqual({ error: 'The end date must be after the start and after today.' })
    expect(await changeWithoutReviewAction(c.id, { budgetUsd: 300, endsAt: '2026-02-31', rewardLocal: 50 })).toEqual({
      error: 'Use whole numbers for the budget and reward, and a real end date.',
    })
    for (const status of ['rejected', 'ended'] as const) {
      await db.campaign.update({ where: { id: c.id }, data: { status } })
      expect(await changeWithoutReviewAction(c.id, { budgetUsd: 400, endsAt: '2026-11-22', rewardLocal: 50 })).toEqual({
        error: "That campaign can't change state right now.",
      })
    }
  })

  it("leaves another workspace's campaign alone", async () => {
    await setup()
    const other = await db.workspace.create({ data: { name: 'Rival', type: 'Brand', country: 'NG', status: 'approved' } })
    const c = await mkCampaign(other.id, 'live')
    clock('2026-11-14T08:00:00Z')
    expect(await changeWithoutReviewAction(c.id, { budgetUsd: 400, endsAt: '2026-11-22', rewardLocal: 50 })).toEqual({
      error: "That campaign isn't in this workspace, so nothing was changed.",
    })
    expect(await endCampaignAction(c.id)).toEqual({ error: "That campaign isn't in this workspace, so nothing was changed." })
    expect((await db.campaign.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('live')
  })

  it('a Viewer is refused both', async () => {
    const { ws } = await setup('Viewer')
    const c = await mkCampaign(ws.id, 'live')
    clock('2026-11-14T08:00:00Z')
    await expect(changeWithoutReviewAction(c.id, { budgetUsd: 400, endsAt: '2026-11-22', rewardLocal: 50 })).rejects.toBe('FORBIDDEN')
    await expect(endCampaignAction(c.id)).rejects.toBe('FORBIDDEN')
    expect(await db.campaign.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ budgetUsd: 300, status: 'live' })
  })

  it('Global leaves an audit trail for both; a member does not', async () => {
    const { ws, actor } = await setup('Global')
    const c = await mkCampaign(ws.id, 'live')
    clock('2026-11-14T08:00:00Z')
    expect(await changeWithoutReviewAction(c.id, { budgetUsd: 400, endsAt: '2026-11-22', rewardLocal: 50 })).toMatchObject({ ok: true })
    expect(await endCampaignAction(c.id)).toMatchObject({ ok: true })
    const trail = await db.auditEvent.findMany({ where: { targetId: c.id }, orderBy: { at: 'asc' } })
    expect(trail.map((a) => [a.action, a.actorId, a.workspaceId])).toEqual([
      ['campaign.change', actor.id, ws.id],
      ['campaign.end', actor.id, ws.id],
    ])
    expect(trail[0].after).toEqual({ budgetUsd: 400 })

    const mine = await mkCampaign(ws.id, 'live')
    const owner = await db.workspaceMember.findFirstOrThrow({ where: { workspaceId: ws.id, role: 'Owner' } })
    vi.mocked(auth).mockResolvedValue({ user: { id: owner.userId, isGlobalAdmin: false }, expires: '' } as never)
    await changeWithoutReviewAction(mine.id, { budgetUsd: 400, endsAt: '2026-11-22', rewardLocal: 50 })
    expect(await db.auditEvent.count({ where: { targetId: mine.id } })).toBe(0)
  })
})

describe('End campaign now', () => {
  it('ends the campaign, releases the unspent budget and says how much', async () => {
    const { ws, owner } = await setup()
    const c = await mkCampaign(ws.id, 'live')
    await charge(ws.id, c.id, 'delivery', -13_300)
    clock('2026-11-14T08:00:00Z')
    // A revised offer still waiting goes with it.
    await editOffer(c.id, owner.id, {
      brand: 'Kola Bright', category: 'Food & drink', headline: 'New', description: 'd', tileColor: '',
      placement: 'featured', redeemMethod: 'code', ageGated: false,
    }, at('2026-11-14T07:00:00Z'))
    await endNow(c.id)
    expect(takeToast()?.message).toBe('Ended — $167 released')
    expect(await db.campaign.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ status: 'ended' })
    expect(await db.campaignRevision.count({ where: { campaignId: c.id, status: 'review' } })).toBe(0)
    const { markup } = await page(c.id)
    expect(chartSub(markup)).toBe('Finished.')
    expect(button(markup, 'Save changes')).toContain('disabled=""')
    expect(markup).not.toMatch(/>(Pause|Resume|End campaign now)<\/button>/)
  })

  it('says so when the campaign has already ended', async () => {
    const { ws } = await setup()
    const c = await mkCampaign(ws.id, 'ended')
    clock('2026-11-14T08:00:00Z')
    expect(await endCampaignAction(c.id)).toEqual({ error: "That campaign can't change state right now." })
    await endNow(c.id)
    expect(takeToast()?.message).toBe("That campaign can't change state right now.")
  })
})

describe('The offer', () => {
  it('lists headline, redeem, category and placement at the snapshot CPM, then the description', async () => {
    const { ws } = await setup()
    clock('2026-11-14T08:00:00Z')
    const c = await mkCampaign(ws.id, 'live')
    const { markup, text: t } = await page(c.id)
    expect(t).toContain(
      'The offer Changing any of this sends the campaign back to review. The current version keeps running until the new one is approved. ' +
        'Headline Buy 2 bottles, get 1 free Redeem Code in store Category Food & drink Placement Featured tile · $2.20 ' +
        'Buy any two 50cl Kola Bright at a participating store and get a third free. Edit offer and resubmit',
    )
    expect(markup).toContain(`<a class="btn g" href="/app/campaigns/${c.id}/edit">Edit offer and resubmit</a>`)
  })

  it('shows the image it runs, the same file See it on Phoenix draws', async () => {
    const { ws } = await setup()
    clock('2026-11-14T08:00:00Z')
    const key = '0b6f2a8e-3c1d-4e5f-9a7b-1c2d3e4f5a6b.jpg'
    const c = await mkCampaign(ws.id, 'live', { creativeImageKey: key })
    const { markup } = await page(c.id)
    const offer = markup.slice(markup.indexOf('<h3>The offer</h3>'))
    expect(offer).toMatch(new RegExp(`<img src="/uploads/${key}" alt="The campaign&#x27;s image"`))
    expect(offer).not.toContain('<video')
    expect(previewOffer(c).creative).toEqual({ image: `/uploads/${key}`, video: null, color: null })
  })

  it('plays a video creative with its controls, opened at its first frame', async () => {
    const { ws } = await setup()
    clock('2026-11-14T08:00:00Z')
    const key = '0b6f2a8e-3c1d-4e5f-9a7b-1c2d3e4f5a6b.mp4'
    const c = await mkCampaign(ws.id, 'review', { placement: 'video', creativeVideoKey: key, cpmCents: 300 })
    const { markup } = await page(c.id)
    const offer = markup.slice(markup.indexOf('<h3>The offer</h3>'))
    expect(offer).toMatch(new RegExp(`<video src="/uploads/${key}#t=0.1" aria-label="The campaign&#x27;s video" controls=""`))
    expect(offer).not.toContain('<img')
    expect(previewOffer(c).creative).toMatchObject({ image: null, video: `/uploads/${key}` })
  })

  it('draws no creative when the offer has none: the card shows its tile colour', async () => {
    const { ws } = await setup()
    clock('2026-11-14T08:00:00Z')
    const c = await mkCampaign(ws.id, 'live')
    const { markup } = await page(c.id)
    const offer = markup.slice(markup.indexOf('<h3>The offer</h3>'))
    expect(offer).not.toMatch(/<img|<video/)
  })

  it("prices a campaign with no snapshot at Phoenix's current rate, and a link offer reads Link", async () => {
    const { ws } = await setup()
    clock('2026-11-14T08:00:00Z')
    const c = await mkCampaign(ws.id, 'review', { cpmCents: null, placement: 'card', redeemMethod: 'link', linkUrl: 'https://k.example' })
    const { text: t } = await page(c.id)
    expect(t).toContain('Redeem Link')
    expect(t).toContain('Placement Wall card · $1.20')
  })
})

describe('History', () => {
  it('lists every decision newest first, revisions included', async () => {
    const { ws, owner, admin } = await setup()
    const c = await mkCampaign(ws.id, 'review', {
      startsAt: at('2026-11-05T23:00:00Z'), endsAt: at('2026-11-19T23:00:00Z'), submittedAt: at('2026-11-05T08:00:00Z'),
      fxPerUsd: null, cpmCents: null,
    })
    clock('2026-11-05T09:00:00Z')
    await rejectCampaign(c.id, admin.id, 'misleading_terms', 'Say where the offer can be redeemed.', at('2026-11-05T10:00:00Z'))
    clock('2026-11-05T12:00:00Z')
    await submitCampaign(c.id, owner.id, at('2026-11-05T12:00:00Z'))
    await approveCampaign(c.id, admin.id, at('2026-11-06T10:00:00Z'))
    const offer: OfferFields = {
      brand: 'Kola Bright', category: 'Food & drink', headline: 'Buy 3 bottles, get 2 free', description: 'd',
      tileColor: '', placement: 'featured', redeemMethod: 'code', ageGated: false,
    }
    const first = await editOffer(c.id, owner.id, offer, at('2026-11-09T09:00:00Z'))
    await approveRevision(first.revision!.id, admin.id, at('2026-11-10T09:00:00Z'))
    const second = await editOffer(c.id, owner.id, offer, at('2026-11-11T09:00:00Z'))
    const code: RejectReason = 'broken_link'
    await rejectRevision(second.revision!.id, admin.id, code, '', at('2026-11-12T09:00:00Z'))
    clock('2026-11-14T08:00:00Z')
    const { markup } = await page(c.id)
    const box = markup.match(/<h3>History<\/h3>(.*?)<\/div><\/div>/)?.[1] ?? ''
    expect(text(box).trim()).toBe(
      [
        '12 Nov · Revised offer not approved: Broken or unsafe link',
        '10 Nov · Revised offer approved',
        '6 Nov · Approved by Global',
        '5 Nov · Rejected: Misleading or unclear terms: Say where the offer can be redeemed.',
      ].join(' '),
    )
  })

  it('says who created the campaign and on which day, over the decisions', async () => {
    const { ws, admin } = await setup()
    const ada = await mkUser('Ada Eze')
    await db.workspaceMember.create({ data: { userId: ada.id, workspaceId: ws.id, role: 'Manager' } })
    const c = await mkCampaign(ws.id, 'review', {
      createdById: ada.id, createdAt: at('2026-11-04T23:30:00Z'), cpmCents: null, fxPerUsd: null,
      startsAt: at('2026-11-05T23:00:00Z'), endsAt: at('2026-11-19T23:00:00Z'),
    })
    await approveCampaign(c.id, admin.id, at('2026-11-06T10:00:00Z'))
    clock('2026-11-14T08:00:00Z')
    const { markup } = await page(c.id)
    // The day is Lagos's: 23:30 UTC on 4 Nov is already the 5th there.
    expect(markup).toContain('<h3>History</h3><p class="sub">Created by Ada Eze on 5 Nov</p><ul class="hist"><li>6 Nov · Approved by Global</li></ul>')
  })

  it('names no creator for a campaign from before creators were recorded', async () => {
    const { ws } = await setup()
    clock('2026-11-14T08:00:00Z')
    const c = await mkCampaign(ws.id, 'live')
    const { markup } = await page(c.id)
    expect(markup).toContain('<h3>History</h3><p class="hist-none">No decisions yet.</p>')
    expect(markup).not.toContain('Created by')
  })

  it('reads "No decisions yet." before anything happened', async () => {
    const { ws } = await setup()
    clock('2026-11-14T08:00:00Z')
    const c = await mkCampaign(ws.id, 'draft', { submittedAt: null })
    const { text: t } = await page(c.id)
    expect(t).toContain('History No decisions yet.')
  })

  it('lists decisions only: a submission waiting for Global is not one', async () => {
    const { ws } = await setup()
    clock('2026-11-14T08:00:00Z')
    const c = await mkCampaign(ws.id, 'review', { submittedAt: at('2026-11-13T08:00:00Z') })
    const { markup } = await page(c.id)
    const box = markup.match(/<h3>History<\/h3>(.*?)<\/div><\/div>/)?.[1] ?? ''
    expect(text(box).trim()).toBe('No decisions yet.')
  })
})

describe('Recent activity', () => {
  // A Phoenix sharer with no number shares on WhatsApp; a friend opens and claims; the payout is held.
  async function journey(role: Role = 'Owner') {
    const { ws, phoenix } = await setup(role)
    const c = await mkCampaign(ws.id, 'live')
    const root = await db.shareLink.create({ data: { code: `R${next()}`, campaignId: c.id, channelId: phoenix.id, depth: 0, sharerType: 'Root' } })
    const link = await db.shareLink.create({
      data: { code: `L${next()}`, campaignId: c.id, channelId: phoenix.id, parentId: root.id, depth: 1, sharerType: 'Channel', sharerSessionId: 'anon-77ab', via: 'whatsapp', createdAt: at('2026-11-13T09:00:00Z') },
    })
    await db.linkEvent.create({ data: { linkId: link.id, type: 'Open', visitorId: 'f1', ipHash: 'i', userAgent: 'u', at: at('2026-11-13T09:10:00Z') } })
    const claim = await db.linkEvent.create({ data: { linkId: link.id, type: 'Claim', visitorId: 'f1', ipHash: 'i', userAgent: 'u', at: at('2026-11-13T09:12:00Z') } })
    const held = await db.rewardPayout.create({
      data: { campaignId: c.id, workspaceId: ws.id, shareLinkId: link.id, sharerSessionId: 'anon-77ab', claimEventKey: claim.id, amountLocal: 50, amountCents: 3, status: 'held', reason: 'no_phone', createdAt: at('2026-11-13T09:12:00Z') },
    })
    clock('2026-11-14T08:00:00Z')
    return { ws, phoenix, c, held }
  }
  const activity = (markup: string) => markup.match(/<div class="box" id="activity">(.*?)<\/div>(?:<\/div>|<div class="box")/)?.[1] ?? ''

  it('is on the page for a Viewer too: every event, newest first, in the market\'s time, ids as tooltips', async () => {
    const { c, held } = await journey('Viewer')
    const { markup, text: t } = await page(c.id)
    expect(t).toContain('Recent activity Every event on this campaign, newest first, in Nigeria time. Hover a line for its record id.')
    expect(text(activity(markup)).trim()).toContain(
      [
        '₦50 airtime for Phoenix user · ••77ab held — No phone number · 13 Nov, 10:12',
        'A friend of Phoenix user · ••77ab took claim code PHX-•••• · 13 Nov, 10:12',
        'A friend of Phoenix user · ••77ab opened the offer · 13 Nov, 10:10',
        'Phoenix user · ••77ab shared via WhatsApp · 13 Nov, 10:00',
      ].join(' '),
    )
    expect(markup).toContain(`<li id="act-reward-${held.id}" title="${held.id}">`)
  })

  const opens = (c: { id: string }, phoenix: { id: string }, n: number) =>
    db.channelEvent.createMany({
      data: Array.from({ length: n }, (_, i) => ({ campaignId: c.id, channelId: phoenix.id, type: 'Open' as const, sessionId: `s${i}`, at: new Date(Date.UTC(2026, 10, 14, 6, i % 60, Math.floor(i / 60))), dedupeKey: `o${i}` })),
    })
  const keys = (box: string) => [...box.matchAll(/<li id="act-([^"]+)"/g)].map((m) => m[1])

  it('shows 30 lines; Show more is the next 30 below the last, as a page of its own without script', async () => {
    const { c, phoenix } = await journey()
    await opens(c, phoenix, 70)
    const first = activity((await page(c.id)).markup)
    expect(first.match(/<li /g)).toHaveLength(30)
    expect(first).not.toContain('Newest')
    const last = keys(first).at(-1)!
    expect(first).toContain(`href="/app/campaigns/${c.id}?before=${last}">Show more</a>`)
    const second = activity((await page(c.id, { before: last })).markup)
    expect(second.match(/<li /g)).toHaveLength(30)
    expect(keys(second).some((k) => keys(first).includes(k))).toBe(false)
    expect(second).toContain(`<a class="btn g s" href="/app/campaigns/${c.id}">Newest</a>`)
    const third = activity((await page(c.id, { before: keys(second).at(-1)! })).markup)
    expect(third.match(/<li /g)).toHaveLength(14)
    expect(third).not.toContain('Show more')
  })

  it('opens at the line a held reward links to, lit, however many lines are newer', async () => {
    const { c, phoenix, held } = await journey()
    await opens(c, phoenix, 70)
    const box = activity((await page(c.id, { line: `reward-${held.id}` })).markup)
    expect(box).toMatch(new RegExp(`^.*?<ul class="hist"><li id="act-reward-${held.id}" title="${held.id}" class="on" aria-current="true">`))
    expect(box.match(/<li /g)).toHaveLength(4)
    expect(box).toContain('Newest')
    // A malformed line is ignored, not looked up.
    const plain = activity((await page(c.id, { line: "x' OR 1=1" })).markup)
    expect(plain.match(/<li /g)).toHaveLength(30)
    expect(plain).not.toContain('class="on"')
  })

  it('Show more fetches the next page for anyone who can see the campaign, and nothing for a key it does not have', async () => {
    const { c, phoenix, ws } = await journey('Viewer')
    await opens(c, phoenix, 40)
    const first = keys(activity((await page(c.id)).markup))
    const more = await moreActivityAction(c.id, first.at(-1))
    if ('error' in more) throw new Error(more.error)
    expect(more.lines).toHaveLength(14)
    expect(more.next).toBeNull()
    expect(more.lines.some((l) => first.includes(l.key))).toBe(false)
    expect(await moreActivityAction(c.id, 'open-nope')).toEqual({ error: "Older activity didn't load. Try Show more again." })
    expect(await moreActivityAction(c.id, "x' OR 1=1")).toHaveProperty('error')
    const other = await db.workspace.create({ data: { name: 'Rival', type: 'Brand', country: 'NG', status: 'approved' } })
    const theirs = await mkCampaign(other.id, 'live')
    expect(await moreActivityAction(theirs.id, first.at(-1))).toHaveProperty('error')
    expect(ws.id).toBeTruthy()
  })
})
