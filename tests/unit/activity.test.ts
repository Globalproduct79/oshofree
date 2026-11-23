import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { PayoutStatus, Prisma, RedeemMethod } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { GET as openLanding } from '@/app/o/[code]/route'
import { POST as claimLanding } from '@/app/o/[code]/claim/route'
import { POST as detailsLanding } from '@/app/o/[code]/details/route'
import { GET as shareLanding } from '@/app/o/[code]/share/route'
import { campaignActivity, isLineKey, lineAnchor, sharersWanted, workspaceSharers } from '@/lib/activity'
import { claimOffer } from '@/lib/claims'
import { db } from '@/lib/db'
import { ingestEvents } from '@/lib/events'
import { maskPhone } from '@/lib/format'
import { mintRootLink } from '@/lib/links'
import { shareOffer } from '@/lib/offers'

// The activity query (Prompt 8): one line per recorded event, newest first, market-local time, phones masked, ids in
// the tooltip, paginated by 30; and the Sharing page's sharers with their friends' events.

const DAY = 86_400_000
const at = (iso: string) => new Date(iso)
let seq = 0
const next = () => ++seq

const ADA = '+2348031234567'
const BAYO = '+2348051112222'

async function world(o: { redeemMethod?: RedeemMethod; campaign?: Partial<Prisma.CampaignUncheckedCreateInput> } = {}) {
  const ws = await db.workspace.create({ data: { name: 'Kola Bright', type: 'Brand', country: 'NG', status: 'approved' } })
  const phoenix = await db.channel.create({ data: { key: 'phoenix', name: 'Phoenix Browser', apiKeyHash: 'h', isLive: true } })
  const campaign = await db.campaign.create({
    data: {
      workspaceId: ws.id, name: 'Buy 2 get 1', brand: 'Kola Bright', country: 'NG', category: 'Food & drink',
      headline: 'Buy 2 bottles, get 1 free', description: 'd', placement: 'card', redeemMethod: o.redeemMethod ?? 'code',
      linkUrl: o.redeemMethod === 'link' ? 'https://kolabright.example/offer' : null, budgetUsd: 300, rewardLocal: 50,
      fxPerUsd: 1500, shareRewardLabel: 'Earn ₦50 airtime', status: 'live',
      startsAt: new Date(Date.now() - 10 * DAY), endsAt: new Date(Date.now() + 10 * DAY), ...o.campaign,
    },
  })
  const root = await mintRootLink(campaign.id, phoenix.id)
  return { ws, phoenix, campaign, root }
}
type World = Awaited<ReturnType<typeof world>>

const event = (w: World, type: 'Impression' | 'Open' | 'Claim' | 'Share' | 'ShareOpen' | 'ShareClaim', iso: string, o: { session?: string; linkCode?: string; campaignId?: string } = {}) =>
  db.channelEvent.create({
    data: {
      channelId: w.phoenix.id, campaignId: o.campaignId ?? w.campaign.id, type, sessionId: o.session ?? `s${next()}`,
      linkCode: o.linkCode, at: at(iso), dedupeKey: `e${next()}`,
    },
  })

const consumer = (phone: string) => db.consumer.create({ data: { phone, country: 'NG' } })

const link = (w: World, o: Partial<Prisma.ShareLinkUncheckedCreateInput>) =>
  db.shareLink.create({
    data: { code: `L${next()}`, campaignId: w.campaign.id, channelId: w.phoenix.id, parentId: w.root.id, depth: 1, sharerType: 'Channel', ...o },
  })

const linkEvent = (linkId: string, type: 'Open' | 'Claim' | 'DetailsLeft', iso: string, o: { visitor?: string; deduped?: boolean } = {}) =>
  db.linkEvent.create({ data: { linkId, type, visitorId: o.visitor ?? `v${next()}`, ipHash: 'i', userAgent: 'u', deduped: o.deduped ?? false, at: at(iso) } })

const payout = (w: World, shareLinkId: string, claimEventKey: string, iso: string, status: PayoutStatus, o: { consumerId?: string | null; session?: string | null; reason?: string } = {}) =>
  db.rewardPayout.create({
    data: {
      campaignId: w.campaign.id, workspaceId: w.ws.id, shareLinkId, claimEventKey, amountLocal: 50, amountCents: 3, status,
      reason: o.reason ?? null, sharerConsumerId: o.consumerId ?? null, sharerSessionId: o.session ?? null, createdAt: at(iso),
    },
  })

const texts = (lines: { text: string }[]) => lines.map((l) => l.text)

// 13 Nov in Lagos (UTC+1): impressions in two hours, an open and a claim with its code, a code with no claim event,
// Ada's WhatsApp share, a friend's open (and a repeat the same day) and claim, the payout and points it earned, and
// Bayo (the friend) leaving his number and passing his own link on by SMS.
async function story(w: World) {
  for (let i = 0; i < 3; i++) await event(w, 'Impression', `2026-11-13T09:${10 + i}:00Z`)
  for (let i = 0; i < 2; i++) await event(w, 'Impression', `2026-11-13T10:0${i}:00Z`)
  const open = await event(w, 'Open', '2026-11-13T10:05:00Z', { session: 'anon-1' })
  const claim = await event(w, 'Claim', '2026-11-13T10:06:00Z', { session: 'anon-1' })
  const code = await db.claimCode.create({
    data: { code: 'PHX-3F9K', campaignId: w.campaign.id, channelId: w.phoenix.id, sessionId: 'anon-1', day: at('2026-11-13T00:00:00Z'), validUntil: w.campaign.endsAt, createdAt: at('2026-11-13T10:06:00Z') },
  })
  const lone = await db.claimCode.create({
    data: { code: 'PHX-7Q2M', campaignId: w.campaign.id, channelId: w.phoenix.id, sessionId: 'anon-2', day: at('2026-11-13T00:00:00Z'), validUntil: w.campaign.endsAt, createdAt: at('2026-11-13T09:40:00Z') },
  })
  const ada = await consumer(ADA)
  const adaLink = await link(w, { sharerSessionId: 'anon-ada1', consumerId: ada.id, via: 'whatsapp', createdAt: at('2026-11-13T10:10:00Z') })
  // Phoenix's own share event for the token, and its friend events: the channel's stats, never lines.
  const shareEvent = await event(w, 'Share', '2026-11-13T10:10:30Z', { session: 'anon-ada1', linkCode: adaLink.code })
  await event(w, 'ShareOpen', '2026-11-13T10:20:00Z', { linkCode: adaLink.code })
  await event(w, 'ShareClaim', '2026-11-13T10:25:00Z', { linkCode: adaLink.code })
  const friendOpen = await linkEvent(adaLink.id, 'Open', '2026-11-13T10:20:00Z', { visitor: 'bayo-phone' })
  await linkEvent(adaLink.id, 'Open', '2026-11-13T10:21:00Z', { visitor: 'bayo-phone', deduped: true })
  const details = await linkEvent(adaLink.id, 'DetailsLeft', '2026-11-13T10:22:00Z', { visitor: 'bayo-phone' })
  const bayo = await consumer(BAYO)
  // His link's row is written now; its moment is the details he left.
  const bayoLink = await link(w, { parentId: adaLink.id, depth: 2, sharerType: 'Consumer', consumerId: bayo.id, sharerSessionId: 'bayo-phone', via: 'sms' })
  const friendClaim = await linkEvent(adaLink.id, 'Claim', '2026-11-13T10:25:00Z', { visitor: 'bayo-phone' })
  // A repeat claim earns nothing and is no line.
  await linkEvent(adaLink.id, 'Claim', '2026-11-13T10:26:00Z', { visitor: 'bayo-phone' })
  const landingCode = await db.claimCode.create({
    data: { code: 'PHX-ABCD', campaignId: w.campaign.id, channelId: w.phoenix.id, sessionId: 'bayo-phone', day: at('2026-11-13T00:00:00Z'), validUntil: w.campaign.endsAt, createdAt: at('2026-11-13T10:25:00Z') },
  })
  const paid = await payout(w, adaLink.id, friendClaim.id, '2026-11-13T10:25:00Z', 'queued', { consumerId: ada.id, session: 'anon-ada1' })
  const pts = await db.pointsLedger.create({
    data: { id: `points:${paid.id}`, consumerId: ada.id, sharerSessionId: 'anon-ada1', campaignId: w.campaign.id, points: 10, createdAt: at('2026-11-13T10:25:00Z') },
  })
  return { open, claim, code, lone, adaLink, shareEvent, friendOpen, details, bayoLink, friendClaim, landingCode, paid, pts }
}

describe('campaignActivity', () => {
  it('is one line per event, newest first, in the market’s time, with the ids behind each line as its title', async () => {
    const w = await world()
    const s = await story(w)
    const { lines, next, line, windowed } = await campaignActivity(w.campaign)
    expect({ next, line, windowed }).toEqual({ next: null, line: null, windowed: false })
    expect(texts(lines)).toEqual([
      '10 points for +234 80• ••• 4567 · 13 Nov, 11:25',
      '₦50 airtime for +234 80• ••• 4567 queued · 13 Nov, 11:25',
      'A friend of +234 80• ••• 4567 took claim code PHX-•••• · 13 Nov, 11:25',
      '+234 80• ••• 2222 shared via SMS (friend of +234 80• ••• 4567) · 13 Nov, 11:22',
      'A friend of +234 80• ••• 4567 opened the offer · 13 Nov, 11:20',
      '+234 80• ••• 4567 shared via WhatsApp · 13 Nov, 11:10',
      'A Phoenix user took claim code PHX-•••• · 13 Nov, 11:06',
      'A Phoenix user opened the offer · 13 Nov, 11:05',
      '2 impressions from Phoenix · 13 Nov, 11:00–12:00',
      'A Phoenix user took claim code PHX-•••• · 13 Nov, 10:40',
      '3 impressions from Phoenix · 13 Nov, 10:00–11:00',
    ])
    const title = (key: string) => lines.find((l) => l.key === key)?.title
    expect(title(`points-${s.pts.id}`)).toBe(s.pts.id)
    expect(title(`reward-${s.paid.id}`)).toBe(s.paid.id)
    // The friend's claim, the payout it is keyed by, and the code the offer page gave them.
    expect(title(`fc-${s.friendClaim.id}`)).toBe(`${s.friendClaim.id} · ${s.paid.id} · ${s.landingCode.id}`)
    expect(title(`link-${s.bayoLink.id}`)).toBe(`${s.bayoLink.id} · ${s.details.id}`)
    expect(title(`link-${s.adaLink.id}`)).toBe(`${s.adaLink.id} · ${s.shareEvent.id}`)
    expect(title(`fo-${s.friendOpen.id}`)).toBe(s.friendOpen.id)
    // Phoenix's claim event and the code POST /claims issued that session that day are one line.
    expect(title(`claim-${s.claim.id}`)).toBe(`${s.claim.id} · ${s.code.id}`)
    expect(title(`open-${s.open.id}`)).toBe(s.open.id)
    expect(title(`code-${s.lone.id}`)).toBe(s.lone.id)
    // An hour's impressions name the hour their dedupe keys end with.
    expect(lines.at(-1)).toMatchObject({ key: 'imp-2026111309', title: 'Impression:2026-11-13T09:00:00.000Z' })
  })

  it('never shows a number: phones are masked, codes are PHX-••••', async () => {
    const w = await world()
    await story(w)
    const { lines } = await campaignActivity(w.campaign)
    const all = JSON.stringify(lines)
    for (const digits of ['8031234567', '8051112222', '3F9K', '7Q2M', 'ABCD']) expect(all).not.toContain(digits)
    expect(all).toContain(maskPhone(ADA))
  })

  it("is another campaign's events: none of them", async () => {
    const w = await world()
    const { workspaceId, country, category, headline, description, placement, redeemMethod, budgetUsd, startsAt, endsAt } = w.campaign
    const other = await db.campaign.create({
      data: {
        workspaceId, country, category, headline, description, placement, redeemMethod, budgetUsd, startsAt, endsAt,
        name: 'Other', brand: 'Other', shareRewardLabel: 'r', status: 'live',
      },
    })
    await event(w, 'Open', '2026-11-13T10:05:00Z', { campaignId: other.id })
    expect((await campaignActivity(w.campaign)).lines).toEqual([])
  })

  it('pages by 30 from a cursor, newest first: each page starts below the last line of the one before', async () => {
    const w = await world()
    for (let i = 0; i < 65; i++) await event(w, 'Open', new Date(Date.UTC(2026, 10, 13, 8, i)).toISOString())
    const first = await campaignActivity(w.campaign)
    expect(first.lines).toHaveLength(30)
    expect(first.windowed).toBe(false)
    expect(first.lines[0].text).toBe('A Phoenix user opened the offer · 13 Nov, 10:04')
    expect(first.next).toBe(first.lines[29].key)
    const second = await campaignActivity(w.campaign, { before: first.next })
    expect(second).toMatchObject({ windowed: true, line: null })
    expect(second.lines).toHaveLength(30)
    expect(second.lines[0].text).toBe('A Phoenix user opened the offer · 13 Nov, 09:34')
    const third = await campaignActivity(w.campaign, { before: second.next })
    expect(third.lines).toHaveLength(5)
    expect(third.next).toBeNull()
    expect(third.lines.at(-1)!.text).toBe('A Phoenix user opened the offer · 13 Nov, 09:00')
    // Every line once, in order.
    const keys = [...first.lines, ...second.lines, ...third.lines].map((l) => l.key)
    expect(new Set(keys).size).toBe(65)
    // A key the campaign does not have starts at the top.
    expect(await campaignActivity(w.campaign, { before: 'open-nope' })).toMatchObject({ windowed: false, lines: first.lines })
  })

  it('walks impressions an hour at a time across pages, and never repeats or drops an hour a cursor sits in', async () => {
    const w = await world()
    // 40 hours with impressions (two in each), the newest 13 Nov 23:xx UTC.
    for (let h = 0; h < 40; h++) {
      const hour = Date.UTC(2026, 10, 13, 23) - h * 3_600_000
      await event(w, 'Impression', new Date(hour + 10 * 60_000).toISOString())
      await event(w, 'Impression', new Date(hour + 50 * 60_000).toISOString())
    }
    // An open inside the newest hour, between its two impressions.
    const open = await event(w, 'Open', '2026-11-13T23:30:00Z')
    const first = await campaignActivity(w.campaign)
    expect(texts(first.lines).slice(0, 3)).toEqual([
      '2 impressions from Phoenix · 14 Nov, 00:00–01:00',
      'A Phoenix user opened the offer · 14 Nov, 00:30',
      '2 impressions from Phoenix · 13 Nov, 23:00–00:00',
    ])
    const second = await campaignActivity(w.campaign, { before: first.next })
    const all = [...first.lines, ...second.lines]
    expect(all).toHaveLength(41)
    expect(new Set(all.map((l) => l.key)).size).toBe(41)
    expect(second.next).toBeNull()
    expect(all.at(-1)!.text).toBe('2 impressions from Phoenix · 12 Nov, 09:00–10:00')
    // Below the open: its hour (whose newest impression is later) was shown above it, so it is not here again.
    const belowOpen = await campaignActivity(w.campaign, { before: `open-${open.id}` })
    expect(belowOpen.lines[0].text).toBe('2 impressions from Phoenix · 13 Nov, 23:00–00:00')
    // Below the newest hour: the open, then the hours before.
    const belowHour = await campaignActivity(w.campaign, { before: first.lines[0].key })
    expect(texts(belowHour.lines).slice(0, 2)).toEqual(['A Phoenix user opened the offer · 14 Nov, 00:30', '2 impressions from Phoenix · 13 Nov, 23:00–00:00'])
  })

  it('pages through 40 lines of one instant: every line once, none skipped', async () => {
    const w = await world()
    for (let i = 0; i < 40; i++) await event(w, 'Open', '2026-11-13T10:00:00Z')
    const first = await campaignActivity(w.campaign)
    expect(first.lines).toHaveLength(30)
    const second = await campaignActivity(w.campaign, { before: first.next })
    expect(second.lines).toHaveLength(10)
    expect(second.next).toBeNull()
    const keys = [...first.lines, ...second.lines].map((l) => l.key)
    expect(new Set(keys).size).toBe(40)
    // At one instant the key orders them, newest first by key, with nothing between the pages lost.
    expect(keys).toEqual([...keys].sort().reverse())
    const stored = await db.channelEvent.findMany({ where: { campaignId: w.campaign.id }, select: { id: true } })
    expect(new Set(keys)).toEqual(new Set(stored.map((e) => `open-${e.id}`)))
  })

  it("makes one line of an hour's impressions from every channel, its count summed, naming each channel most first", async () => {
    const w = await world()
    const boomplay = await db.channel.create({ data: { key: 'boomplay', name: 'Boomplay Music', apiKeyHash: 'b', isLive: true } })
    for (const m of ['05', '20', '40']) await event(w, 'Impression', `2026-11-13T10:${m}:00Z`)
    await db.channelEvent.create({
      data: { channelId: boomplay.id, campaignId: w.campaign.id, type: 'Impression', sessionId: 'b1', at: at('2026-11-13T10:50:00Z'), dedupeKey: 'b1' },
    })
    // Boomplay alone in the hour before.
    await db.channelEvent.create({
      data: { channelId: boomplay.id, campaignId: w.campaign.id, type: 'Impression', sessionId: 'b2', at: at('2026-11-13T09:15:00Z'), dedupeKey: 'b2' },
    })
    const { lines } = await campaignActivity(w.campaign)
    expect(lines).toEqual([
      { key: 'imp-2026111310', text: '4 impressions from Phoenix and Boomplay · 13 Nov, 11:00–12:00', title: 'Impression:2026-11-13T10:00:00.000Z' },
      { key: 'imp-2026111309', text: '1 impression from Boomplay · 13 Nov, 10:00–11:00', title: 'Impression:2026-11-13T09:00:00.000Z' },
    ])
  })

  it('opens at a line a link asks for, however far back, and ignores a line it does not have', async () => {
    const w = await world()
    const sharer = await link(w, { sharerSessionId: 'anon-9z9z', via: 'whatsapp', createdAt: at('2026-11-10T08:00:00Z') })
    const claim = await linkEvent(sharer.id, 'Claim', '2026-11-10T09:00:00Z')
    const held = await payout(w, sharer.id, claim.id, '2026-11-10T09:00:00Z', 'held', { session: 'anon-9z9z', reason: 'no_phone' })
    for (let i = 0; i < 100; i++) await event(w, 'Open', new Date(Date.UTC(2026, 10, 13, 6, 0, i)).toISOString())
    const found = await campaignActivity(w.campaign, { line: `reward-${held.id}` })
    expect(found).toMatchObject({ line: `reward-${held.id}`, windowed: true, next: null })
    expect(texts(found.lines)).toEqual([
      '₦50 airtime for Phoenix user ••9z9z held — No phone number · 10 Nov, 10:00',
      'A friend of Phoenix user ••9z9z took claim code PHX-•••• · 10 Nov, 10:00',
      'Phoenix user ••9z9z shared via WhatsApp · 10 Nov, 09:00',
    ])
    const top = await campaignActivity(w.campaign, { line: 'reward-nope' })
    expect(top).toMatchObject({ line: null, windowed: false })
    expect(top.lines).toHaveLength(30)
    expect(top.next).not.toBeNull()
  })

  it("says each reward's state and why it was not queued, and points taken back", async () => {
    const w = await world()
    const ada = await consumer(ADA)
    const l = await link(w, { sharerSessionId: 'anon-ada1', consumerId: ada.id, via: 'x', createdAt: at('2026-11-13T07:00:00Z') })
    const cases: [PayoutStatus, string | undefined][] = [['sent', undefined], ['blocked', 'same_device'], ['rejected', 'cap'], ['rejected', 'manual'], ['held', 'phone_reuse']]
    for (const [i, [status, reason]] of cases.entries()) {
      const c = await linkEvent(l.id, 'Claim', `2026-11-13T08:0${i}:00Z`)
      await payout(w, l.id, c.id, `2026-11-13T08:0${i}:00Z`, status, { consumerId: ada.id, reason })
    }
    await db.pointsLedger.create({ data: { id: 'points:x:void', consumerId: ada.id, campaignId: w.campaign.id, points: -10, createdAt: at('2026-11-13T09:00:00Z') } })
    const rewards = texts((await campaignActivity(w.campaign)).lines).filter((t) => /airtime|points/.test(t))
    expect(rewards).toEqual([
      '10 points taken back from +234 80• ••• 4567 · 13 Nov, 10:00',
      '₦50 airtime for +234 80• ••• 4567 held — Phone reused across sharers · 13 Nov, 09:04',
      '₦50 airtime for +234 80• ••• 4567 rejected — Rejected by Global · 13 Nov, 09:03',
      '₦50 airtime for +234 80• ••• 4567 rejected — Over the campaign cap · 13 Nov, 09:02',
      '₦50 airtime for +234 80• ••• 4567 blocked — Same device · 13 Nov, 09:01',
      '₦50 airtime for +234 80• ••• 4567 sent · 13 Nov, 09:00',
    ])
  })

  it("reads a link offer's claims as clicks through, and its own link's events as follows", async () => {
    const w = await world({ redeemMethod: 'link' })
    await event(w, 'Claim', '2026-11-13T10:00:00Z')
    // The same tap's click-through on the Root link: one tap, one line (the claim's).
    await linkEvent(w.root.id, 'Claim', '2026-11-13T10:01:00Z')
    // A click-through Phoenix did not report as a claim is a line of its own.
    await linkEvent(w.root.id, 'Claim', '2026-11-13T10:30:00Z', { visitor: 'v-other' })
    await linkEvent(w.root.id, 'Open', '2026-11-13T10:02:00Z')
    await linkEvent(w.root.id, 'Open', '2026-11-13T10:03:00Z', { deduped: true })
    const l = await link(w, { sharerSessionId: 'anon-77ab', via: 'facebook', createdAt: at('2026-11-13T10:04:00Z') })
    const c = await linkEvent(l.id, 'Claim', '2026-11-13T10:05:00Z')
    await payout(w, l.id, c.id, '2026-11-13T10:05:00Z', 'held', { session: 'anon-77ab', reason: 'no_phone' })
    expect(texts((await campaignActivity(w.campaign)).lines)).toEqual([
      'Someone followed the link to your site · 13 Nov, 11:30',
      '₦50 airtime for Phoenix user ••77ab held — No phone number · 13 Nov, 11:05',
      'A friend of Phoenix user ••77ab clicked through to your site · 13 Nov, 11:05',
      'Phoenix user ••77ab shared via Facebook · 13 Nov, 11:04',
      'Someone opened the offer page · 13 Nov, 11:02',
      'A Phoenix user clicked through to your site · 13 Nov, 11:00',
    ])
  })

  it('follows the real journey: Phoenix shows, opens, claims and shares; a friend opens, claims and passes it on', async () => {
    const w = await world()
    const now = new Date()
    const ts = now.toISOString()
    await ingestEvents(w.phoenix.id, 'batch-1', [
      { type: 'impression', offer_id: w.campaign.id, session_id: 'anon-1', ts },
      { type: 'open', offer_id: w.campaign.id, session_id: 'anon-1', ts },
    ])
    const issued = await claimOffer(w.campaign.id, w.phoenix.id, 'anon-1', now)
    expect(issued).not.toBe('unknown_offer')
    await ingestEvents(w.phoenix.id, 'batch-2', [{ type: 'claim', offer_id: w.campaign.id, session_id: 'anon-1', ts, claim_code: 'x' }])
    const shared = await shareOffer(w.campaign.id, w.phoenix.id, 'anon-1', 'whatsapp', now, '08031234567')
    if (typeof shared === 'string') throw new Error(shared)
    const friend = { cookie: 'og_v=0f1e2d3c-4b5a-4968-8776-655443322110' }
    const req = (path: string, init: RequestInit = {}) =>
      new Request(`http://localhost/o/${shared.code}${path}`, { ...init, headers: { ...friend, 'user-agent': 'Mozilla/5.0', ...init.headers } })
    const params = { params: Promise.resolve({ code: shared.code }) }
    expect((await openLanding(req(''), params)).status).toBe(200)
    expect((await claimLanding(req('/claim', { method: 'POST' }), params)).status).toBe(200)
    const form = new URLSearchParams({ phone: '0805 111 2222', name: 'Bayo' })
    const left = await detailsLanding(
      req('/details', { method: 'POST', body: form, headers: { 'content-type': 'application/x-www-form-urlencoded' } }), params,
    )
    expect(left.status).toBe(200)
    const own = await db.shareLink.findFirstOrThrow({ where: { sharerType: 'Consumer' } })
    await shareLanding(new Request(`http://localhost/o/${own.code}/share?via=whatsapp`), { params: Promise.resolve({ code: own.code }) })

    const { lines } = await campaignActivity(w.campaign)
    // Every line is today's; the words are what matter here, in the order they happened.
    const words = texts(lines).map((t) => t.replace(/ · \d+ \w+, \d\d:\d\d(–\d\d:\d\d)?$/, ''))
    expect(words).toEqual([
      '+234 80• ••• 2222 shared via WhatsApp (friend of +234 80• ••• 4567)',
      '10 points for +234 80• ••• 4567',
      '₦50 airtime for +234 80• ••• 4567 queued',
      'A friend of +234 80• ••• 4567 took claim code PHX-••••',
      'A friend of +234 80• ••• 4567 opened the offer',
      '+234 80• ••• 4567 shared via WhatsApp',
      'A Phoenix user took claim code PHX-••••',
      'A Phoenix user opened the offer',
      '1 impression from Phoenix',
    ])
  })
})

describe('sharersWanted, lineAnchor and isLineKey', () => {
  it('asks for whole pages of 30 sharers, one page at least', () => {
    expect([undefined, '', 'x', '-5', '0', '29'].map((v) => sharersWanted(v))).toEqual([30, 30, 30, 30, 30, 30])
    expect(sharersWanted('60')).toBe(60)
    expect(sharersWanted('61')).toBe(90)
    expect(sharersWanted(['90', '30'])).toBe(90)
    expect(sharersWanted('1e9')).toBe(3000)
  })
  it('makes an element id of any key, and takes only a kind and an id from a URL', () => {
    expect(lineAnchor('reward-cm123')).toBe('act-reward-cm123')
    expect(lineAnchor('points-points:cm1:void')).toBe('act-points-points-cm1-void')
    expect(['reward-cm1', 'points-points:cm1:void', 'imp-2026111309'].every(isLineKey)).toBe(true)
    expect([undefined, '', "x' OR 1=1", 'a'.repeat(161), ['reward-cm1']].some(isLineKey)).toBe(false)
  })
})

describe('workspaceSharers', () => {
  it("lists each sharer once per campaign, newest first, with what their friends did and the rewards they earned", async () => {
    const w = await world()
    await story(w)
    const { rows, more } = await workspaceSharers(w.ws.id)
    expect(more).toBe(false)
    expect(rows.map((r) => ({ campaign: r.campaign, who: r.who, friendOf: r.friendOf, via: r.via, opened: r.opened, claimed: r.claimed, rewards: r.rewards, total: r.total }))).toEqual([
      // Ada: her friend's claim (11:25) is the newest event of any sharer.
      { campaign: 'Buy 2 get 1', who: '+234 80• ••• 4567', friendOf: null, via: 'WhatsApp', opened: 1, claimed: 1, rewards: '₦50 queued', total: 3 },
      { campaign: 'Buy 2 get 1', who: '+234 80• ••• 2222', friendOf: '+234 80• ••• 4567', via: 'SMS', opened: 0, claimed: 0, rewards: null, total: 0 },
    ])
    // Ada's chain: her friend claimed (and what it earned), left a number and passed it on, and opened it first.
    expect(texts(rows[0].lines)).toEqual([
      'A friend took claim code PHX-••••, ₦50 airtime queued · 13 Nov, 11:25',
      '+234 80• ••• 2222, a friend, got a link of their own and shared it via SMS · 13 Nov, 11:22',
      'A friend opened the offer · 13 Nov, 11:20',
    ])
    expect(rows[0].lines[0].title.split(' · ')).toHaveLength(3)
    expect(rows[1].lines).toEqual([])
  })

  it('pages sharers by 30, keeps the newest 30 of a sharer’s friends, and has nothing for a workspace without campaigns', async () => {
    const w = await world()
    for (let i = 0; i < 31; i++) await link(w, { sharerSessionId: `anon-${String(i).padStart(4, '0')}`, via: 'sms', createdAt: new Date(Date.UTC(2026, 10, 13, 8, i)) })
    const busy = await link(w, { sharerSessionId: 'anon-busy', via: 'whatsapp', createdAt: at('2026-11-12T08:00:00Z') })
    for (let i = 0; i < 33; i++) await linkEvent(busy.id, 'Open', new Date(Date.UTC(2026, 10, 13, 9, i)).toISOString())
    const first = await workspaceSharers(w.ws.id)
    expect(first.rows).toHaveLength(30)
    expect(first.more).toBe(true)
    expect(first.rows[0]).toMatchObject({ who: 'Phoenix user ••busy', opened: 33, total: 33 })
    expect(first.rows[0].lines).toHaveLength(30)
    expect(first.rows[0].lines[0].text).toBe('A friend opened the offer · 13 Nov, 10:32')
    const all = await workspaceSharers(w.ws.id, { limit: 60 })
    expect(all.rows).toHaveLength(32)
    expect(all.more).toBe(false)
    const empty = await db.workspace.create({ data: { name: 'Empty', type: 'Brand', country: 'NG', status: 'approved' } })
    expect(await workspaceSharers(empty.id)).toEqual({ rows: [], more: false })
  })
})

describe('the channel_event_campaign_type_at migration', () => {
  const MIGRATIONS = path.join(process.cwd(), 'prisma', 'migrations')
  const all = readdirSync(MIGRATIONS).filter((d) => /^\d{14}_/.test(d)).sort()
  const dir = all.find((d) => d.endsWith('_channel_event_campaign_type_at'))

  it('comes after the campaign_created_by migration and only adds the index Recent activity pages by', () => {
    expect(dir).toBeDefined()
    expect(all.indexOf(dir!)).toBeGreaterThan(all.indexOf('20261115090000_campaign_created_by'))
    const statements = readFileSync(path.join(MIGRATIONS, dir!, 'migration.sql'), 'utf8').replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim()
    expect(statements).toBe('CREATE INDEX "ChannelEvent_campaignId_type_at_idx" ON "ChannelEvent"("campaignId", "type", "at");')
    expect(readFileSync(path.join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8')).toContain('@@index([campaignId, type, at])')
  })

  it('is applied to the database the tests run on', async () => {
    const rows = await db.$queryRaw<{ indexname: string }[]>`SELECT indexname FROM pg_indexes WHERE tablename = 'ChannelEvent'`
    expect(rows.map((r) => r.indexname)).toContain('ChannelEvent_campaignId_type_at_idx')
  })
})
