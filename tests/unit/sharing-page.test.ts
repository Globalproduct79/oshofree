import type { CampaignStatus, Prisma } from '@prisma/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SharingPage from '@/app/app/(console)/sharing/page'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

vi.mock('@/lib/auth', () => ({ auth: vi.fn(), signOut: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const jar = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }))
vi.mock('next/navigation', async (o) => ({ ...(await o<typeof import('next/navigation')>()), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('next/headers', () => ({ cookies: async () => jar }))

let seq = 0
const next = () => ++seq
const at = (iso: string) => new Date(iso)

function mkCampaign(workspaceId: string, name: string, status: CampaignStatus, o: Partial<Prisma.CampaignUncheckedCreateInput> = {}) {
  return db.campaign.create({
    data: {
      workspaceId, name, brand: 'Kola Bright', country: 'NG', category: 'Food & drink', headline: `${name} headline`,
      description: 'd', placement: 'card', redeemMethod: 'code', budgetUsd: 100, shareRewardLabel: 'r', status,
      startsAt: at('2026-11-06T23:00:00Z'), endsAt: at('2026-11-20T23:00:00Z'), ...o,
    },
  })
}

const text = (markup: string) =>
  markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&')

async function setup(o: { pointsPerShare?: number } = {}) {
  const ws = await db.workspace.create({ data: { name: 'Kola Bright', type: 'Brand', country: 'NG', status: 'approved', ...o } })
  const user = await db.user.create({ data: { email: `u${next()}@x.test`, name: 'Tunde Okafor', passwordHash: 'x' } })
  await db.workspaceMember.create({ data: { userId: user.id, workspaceId: ws.id, role: 'Owner' } })
  vi.mocked(auth).mockResolvedValue({ user: { id: user.id, isGlobalAdmin: false }, expires: '' } as never)
  jar.get.mockImplementation((k: string) => (k === 'of_ws' ? { value: ws.id } : undefined))
  return ws
}

async function page() {
  const markup = renderToStaticMarkup(await SharingPage())
  return { markup, text: text(markup) }
}

// A live campaign with 5 shares (3 WhatsApp, 1 Facebook, 1 X) and an ended one with 1 SMS share.
async function seed(wsId: string) {
  const phoenix = await db.channel.create({ data: { key: 'phoenix', name: 'Phoenix', apiKeyHash: 'h', isLive: true } })
  const live = await mkCampaign(wsId, 'Buy 2 get 1', 'live')
  const ended = await mkCampaign(wsId, 'August multipack', 'ended', { country: 'KE', startsAt: at('2026-08-01T00:00:00Z'), endsAt: at('2026-08-15T00:00:00Z') })
  const link = (c: { id: string }, depth: number, via?: 'whatsapp' | 'facebook' | 'x' | 'sms', parentId?: string) =>
    db.shareLink.create({ data: { code: `L${next()}`, campaignId: c.id, channelId: phoenix.id, depth, sharerType: depth === 0 ? 'Root' : 'Channel', parentId, via, sharerSessionId: `s${next()}` } })
  const root = await link(live, 0)
  const sent = [] as { id: string }[]
  for (const via of ['whatsapp', 'whatsapp', 'whatsapp', 'facebook', 'x'] as const) sent.push(await link(live, 1, via, root.id))
  const rootE = await link(ended, 0)
  const sentE = await link(ended, 1, 'sms', rootE.id)
  const opens = (linkId: string, n: number) =>
    db.linkEvent.createMany({ data: Array.from({ length: n }, () => ({ linkId, type: 'Open' as const, visitorId: `v${next()}`, ipHash: 'i', userAgent: 'u', at: at('2026-11-10T10:00:00Z') })) })
  await opens(sent[0].id, 4)
  await opens(sentE.id, 2)
  const channelEvents = (c: { id: string }, type: 'Open', n: number) =>
    db.channelEvent.createMany({ data: Array.from({ length: n }, () => ({ campaignId: c.id, channelId: phoenix.id, type, sessionId: `s${next()}`, at: at('2026-11-10T10:00:00Z'), dedupeKey: `e${next()}` })) })
  await channelEvents(live, 'Open', 10)
  await channelEvents(ended, 'Open', 10)
  const payout = (c: { id: string }, linkId: string, status: 'sent' | 'queued', cents: number) =>
    db.rewardPayout.create({ data: { campaignId: c.id, workspaceId: wsId, shareLinkId: linkId, claimEventKey: `claim${next()}`, amountLocal: 50, amountCents: cents, status } })
  await payout(live, sent[0].id, 'sent', 30)
  await payout(live, sent[1].id, 'queued', 30)
  await payout(ended, sentE.id, 'sent', 40)
  for (const [c, cents] of [[live, -6000], [ended, -4000]] as const)
    await db.ledgerEntry.create({ data: { workspaceId: wsId, campaignId: c.id, kind: 'reward', amountCents: cents, at: at('2026-11-10T10:00:00Z'), description: 'x' } })
  await db.pointsLedger.createMany({ data: [{ campaignId: live.id, points: 20 }, { campaignId: ended.id, points: 10 }] })
  return { live, ended }
}

beforeEach(() => vi.clearAllMocks())

describe('Sharing page', () => {
  it('shows the head and four KPIs totalled over every campaign, ended included', async () => {
    const ws = await setup()
    await seed(ws.id)
    const t = (await page()).text
    expect(t).toContain('Kola Bright › Growth › Sharing')
    expect(t).toContain('Phoenix users share your offers with a unique token. When a friend opens and claims, the sharer earns airtime and points, paid from your budget.')
    expect(t).toContain('Shares 6 across 2 campaigns')
    // 4 + 2 friend opens over 20 opens.
    expect(t).toContain('Friends opened 6 viral coefficient 0.30')
    expect(t).toContain('Friends claimed 3 50.0% of friend opens')
    expect(t).toContain('Rewards paid $100 airtime via aggregator')
  })

  it('has zero KPIs and a table that says why it is empty for a workspace with no campaigns', async () => {
    const ws = await setup()
    const { markup, text: t } = await page()
    expect(t).toContain('Shares 0 across 0 campaigns')
    expect(t).toContain('viral coefficient 0.00')
    expect(t).toContain('0% of friend opens')
    expect(markup).not.toContain('class="row"')
    expect(markup).not.toContain('class="hbar"')
    expect(t).toContain('Campaign Shares Friend opens Friend claims Viral Rewards No shares yet. Shares start once a campaign is live on Phoenix. New campaign')
    expect(ws.id).toBeTruthy()
  })

  it('lists every campaign with its brand and market, linking to its page', async () => {
    const ws = await setup()
    const { live, ended } = await seed(ws.id)
    const { markup, text: t } = await page()
    expect(t).toContain('Campaign Shares Friend opens Friend claims Viral Rewards')
    expect(t).toContain('Buy 2 get 1 Kola Bright · Nigeria 5 4 2 0.40 $60')
    expect(t).toContain('August multipack Kola Bright · Kenya 1 2 1 0.20 $40')
    for (const c of [live, ended]) expect(markup).toContain(`data-href="/app/campaigns/${c.id}"`)
  })

  it('sorts where people share by shares, with a percentage', async () => {
    const ws = await setup()
    await seed(ws.id)
    const { markup } = await page()
    const rows = [...markup.matchAll(/class="lab">([^<]+)<\/span>.*?class="v">([^<]+)</g)].map((m) => [m[1], m[2]])
    expect(rows).toEqual([['WhatsApp', '50.0%'], ['Facebook', '16.7%'], ['X', '16.7%'], ['SMS', '16.7%']])
  })

  it('sums the points ledger and uses the workspace points per share', async () => {
    const ws = await setup({ pointsPerShare: 25 })
    await seed(ws.id)
    const t = (await page()).text
    expect(t).toContain('Points issued OshoFree points 30 25 per successful share · redeemable when the loyalty layer launches')
    expect(t).toContain('plus 25 OshoFree points toward the loyalty layer')
  })

  it('explains how a share works, with the token and event as chips', async () => {
    const ws = await setup()
    const { markup, text: t } = await page()
    expect(t).toContain('How a share works Three steps. The token is what makes it measurable and makes the reward fair.')
    expect(t).toContain('1 Share')
    expect(t).toContain('2 Friend opens and claims')
    expect(t).toContain('3 Sharer earns')
    expect(t).toContain('Opens alone earn nothing.')
    expect(t).toContain('Capped per sharer per day and at 20% of your budget.')
    expect(markup).toContain('<span class="tok">PHX-K4Q7-7A2</span>')
    expect(markup).toContain('<span class="tok">share_claim</span>')
    expect(t).toContain('Where people share Tagged on the token, so you know which platform works.')
    expect(ws.id).toBeTruthy()
  })
})
