import type { Campaign, Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { POST as realClaim } from '@/app/o/[code]/claim/route'
import { POST as realDetails } from '@/app/o/[code]/details/route'
import { GET as realPage } from '@/app/o/[code]/route'
import { GET as realShare } from '@/app/o/[code]/share/route'
import { GET as previewClaimGet, POST as previewClaim } from '@/app/o/preview/claim/route'
import { POST as previewDetails } from '@/app/o/preview/details/route'
import { GET as previewPage } from '@/app/o/preview/route'
import { GET as previewShare } from '@/app/o/preview/share/route'
import { offerPreview } from '@/lib/campaign-card'
import { COPY } from '@/lib/copy'
import { db } from '@/lib/db'
import { type LandingView, renderLanding, renderShareSheet } from '@/lib/landing/render'
import { PREVIEW_CODE, previewLanding, previewLandingView, previewShareSheet, shareMessage } from '@/lib/landing/preview'
import { viewFor } from '@/lib/landing/view'
import { linkUrl, mintRootLink } from '@/lib/links'
import { previewOffersFor } from '@/lib/offers'

const DAY = 86_400_000
const L = COPY.landing

const view = (over: Partial<LandingView> = {}): LandingView => ({
  state: 'offer', code: 'ABCDEFGH', brand: 'Kola Bright', headline: 'Buy 2 Kola Bright, get 1 free',
  description: 'At any Kola Bright stockist.', imageUrl: null, color: null, rewardLabel: 'Earn ₦50 airtime',
  endsAtText: '21 Nov', redeemMethod: 'code', ...over,
})

// A live Kola Bright offer in Nigeria with Phoenix set up and its Root link minted, as approval leaves it.
async function seed(over: Partial<Prisma.CampaignUncheckedCreateInput> = {}): Promise<{ campaign: Campaign; root: string }> {
  const ws = await db.workspace.create({ data: { name: 'Kola Bright', type: 'Brand', country: 'NG', status: 'approved' } })
  const campaign = await db.campaign.create({
    data: {
      workspaceId: ws.id, name: 'Buy 2 get 1', brand: 'Kola Bright', country: 'NG', category: 'Food & drink',
      headline: 'Buy 2 Kola Bright, get 1 free', description: 'Show your claim code at any Kola Bright stockist.',
      placement: 'card', redeemMethod: 'code', budgetUsd: 100, rewardLocal: 50, fxPerUsd: 1500, status: 'live',
      shareRewardLabel: 'Earn ₦50 airtime', tileColor: '#0F766E',
      startsAt: new Date(Date.now() - DAY), endsAt: new Date('2026-12-01T23:00:00Z'), ...over,
    },
  })
  const phoenix = await db.channel.upsert({
    where: { key: 'phoenix' }, update: {}, create: { key: 'phoenix', name: 'Phoenix', apiKeyHash: 'h', isLive: true },
  })
  return { campaign, root: (await mintRootLink(campaign.id, phoenix.id)).code }
}

// Every row a visit, a claim or a share can leave behind.
async function written() {
  const [claimCodes, channelEvents, shareLinks, linkEvents, consumers, payouts, ledger, points] = await Promise.all([
    db.claimCode.count(), db.channelEvent.count(), db.shareLink.count(), db.linkEvent.count(), db.consumer.count(),
    db.rewardPayout.count(), db.ledgerEntry.count(), db.pointsLedger.count(),
  ])
  return { claimCodes, channelEvents, shareLinks, linkEvents, consumers, payouts, ledger, points }
}

const ORIGIN = 'http://localhost:3101'
const FRIEND = { name: 'Ada', phone: '0803 123 4567' }
const post = (path: string, fields: Record<string, string> = {}) =>
  new Request(`${ORIGIN}${path}`, { method: 'POST', body: new URLSearchParams(fields) })
const params = (code: string) => ({ params: Promise.resolve({ code }) })
// Next hands a route the request; the preview's routes never look at it.
const serve = (route: (req: Request) => Promise<Response>, req: Request) => route(req)
const formActions = (html: string) => [...html.matchAll(/<form method="post" action="([^"]+)">/g)].map((m) => m[1])

describe('renderLanding with the preview flag', () => {
  it('leaves the real page exactly as it was', () => {
    for (const state of ['offer', 'code', 'shared', 'ended', 'error'] as const) {
      const real = view({
        state, claimCode: 'KOLA2X1', myUrl: `${ORIGIN}/o/ZZZZZZZZ`,
        shareTargets: { whatsapp: '/o/ZZZZZZZZ/share?via=whatsapp', sms: '/o/ZZZZZZZZ/share?via=sms', x: '/o/ZZZZZZZZ/share?via=x' },
      })
      const html = renderLanding(real)
      expect(renderLanding({ ...real, preview: false })).toBe(html)
      expect(html).not.toContain(L.preview)
      expect(html).not.toContain('disabled')
    }
  })

  it('says nothing is recorded, above the offer', () => {
    const html = renderLanding(view({ preview: true }))
    expect(html).toContain(`<main><p class="pv" role="note">${L.preview}</p>`)
    expect(html.indexOf(L.preview)).toBeLessThan(html.indexOf('<h1>'))
  })

  it('keeps the real claim button and reward line, inert', () => {
    const html = renderLanding(view({ preview: true }))
    expect(html).toContain('<p class="reward">')
    expect(html).toContain('Earn ₦50 airtime')
    expect(html).toContain('<button class="btn primary" disabled>Show my code</button>')
    expect(renderLanding(view({ preview: true, redeemMethod: 'link' }))).toContain('<button class="btn primary" disabled>Open offer</button>')
  })

  it('makes every field and button of Share and earn inert', () => {
    const html = renderLanding(view({ preview: true }))
    expect(html).toContain('<input id="name" name="name" autocomplete="name" maxlength="80" disabled>')
    expect(html).toContain('<input id="phone" name="phone" type="tel" autocomplete="tel" maxlength="20" required disabled>')
    expect(html).toContain(`<button class="btn secondary" disabled>${L.getLink}</button>`)
  })

  it("draws the sharer's buttons without anywhere to go", () => {
    const html = renderLanding(view({
      state: 'shared', preview: true, myUrl: `${ORIGIN}/o/preview`,
      shareTargets: { whatsapp: '/o/preview/share?via=whatsapp', sms: '/o/preview/share?via=sms', x: '/o/preview/share?via=x' },
    }))
    for (const label of [L.whatsapp, L.sms, L.x]) expect(html).toContain(`<a class="btn secondary" aria-disabled="true">${label}</a>`)
    expect(html).not.toContain('href=')
    expect(html).toContain(`<input id="mylink" readonly value="${ORIGIN}/o/preview">`)
  })

  it("draws the sharer's part of the page on its own: the real Share and earn section, under the preview line", () => {
    const shared = view({
      state: 'shared', preview: true, myUrl: `${ORIGIN}/o/preview`,
      shareTargets: { whatsapp: '/o/preview/share?via=whatsapp', sms: '/o/preview/share?via=sms', x: '/o/preview/share?via=x' },
    })
    const sheet = renderShareSheet(shared)
    const section = /<section>.*<\/section>/.exec(renderLanding(shared))![0]
    expect(sheet).toContain(`<main><p class="pv" role="note">${L.preview}</p>${section}</main>`)
    expect(sheet.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(sheet).not.toContain('<h1>')
    expect(sheet).not.toContain('<form')
  })

  it('answers a preview link with a page that says so', () => {
    const html = renderLanding({ ...view({ state: 'preview', brand: '', headline: '' }), preview: true })
    expect(html).toContain(L.preview)
    expect(html).toContain(L.previewOnly)
    expect(html).not.toContain('<form')
  })
})

describe('previewLandingView', () => {
  it("is the real page's view of the campaign, at the preview's code", async () => {
    const key = '0b6f2a8e-3c1d-4e5f-9a7b-1c2d3e4f5a6b.jpg'
    for (const over of [{}, { creativeImageKey: key }, { tileColor: null }, { tileColor: '#123456' }, { redeemMethod: 'link' as const, linkUrl: 'https://kolabright.ng' }]) {
      const { campaign, root } = await seed(over)
      const link = await db.shareLink.findUniqueOrThrow({ where: { code: root }, include: { campaign: true } })
      const { code, ...real } = viewFor(link, 'offer')
      expect(code).toBe(root)
      expect(previewLandingView(offerPreview(campaign), 'offer')).toEqual({ ...real, code: PREVIEW_CODE, preview: true })
    }
  })

  it("shares the sample link: the sharer's own link, a copy field and the share buttons", async () => {
    const { campaign } = await seed()
    const v = previewLandingView(offerPreview(campaign), 'shared')
    expect(v).toMatchObject({ state: 'shared', myUrl: `${ORIGIN}/o/preview`, preview: true })
    expect(renderLanding(v)).toContain(L.yourLink)
  })
})

describe('shareMessage', () => {
  it('is the text the real share buttons send, with the sample link in place of a sharer\'s', async () => {
    const { campaign, root } = await seed()
    const res = await realShare(new Request(`${ORIGIN}/o/${root}/share?via=whatsapp`), params(root))
    const sent = decodeURIComponent(new URL(res.headers.get('location')!).searchParams.get('text')!)
    expect(sent).toBe(`Kola Bright: Buy 2 Kola Bright, get 1 free ${linkUrl(root)}`)
    const model = offerPreview(campaign)
    expect(shareMessage({ ...model, sampleLink: linkUrl(root) })).toBe(sent)
    expect(shareMessage(model)).toBe(`Kola Bright: Buy 2 Kola Bright, get 1 free ${ORIGIN}/o/preview`)
  })
})

describe('the preview records nothing', () => {
  it('a real visit, claim and share on the same campaign do write rows (the counts can move)', async () => {
    const { root } = await seed()
    const before = await written()
    await realPage(new Request(`${ORIGIN}/o/${root}`), params(root))
    await realClaim(post(`/o/${root}/claim`), params(root))
    await realDetails(post(`/o/${root}/details`, FRIEND), params(root))
    const after = await written()
    expect(after.linkEvents).toBeGreaterThan(before.linkEvents)
    expect(after.claimCodes).toBeGreaterThan(before.claimCodes)
    expect(after.shareLinks).toBeGreaterThan(before.shareLinks)
  })

  it("pressing the preview's claim, Get my link and share buttons, and opening its sample link, writes no row", async () => {
    const { campaign } = await seed()
    const model = offerPreview(campaign)
    const before = await written()

    // Opening the preview: the live offers it draws around the campaign are read, never minted.
    await previewOffersFor('NG', new Date())
    const offer = previewLanding(model, 'offer')
    const sheet = previewShareSheet(model)
    expect(formActions(offer)).toEqual(['/o/preview/claim', '/o/preview/details'])
    expect(formActions(sheet)).toEqual([])
    expect(`${offer}${sheet}`).not.toContain('href=')

    // What each form would send, to the route Next serves for it: each refuses and says why.
    const answers = [
      await serve(previewClaim, post('/o/preview/claim')),
      await serve(previewClaimGet, new Request(`${ORIGIN}/o/preview/claim`)),
      await serve(previewDetails, post('/o/preview/details', FRIEND)),
      await serve(previewShare, new Request(`${ORIGIN}/o/preview/share?via=whatsapp`)),
      await serve(previewPage, new Request(model.sampleLink)),
    ]
    for (const res of answers) {
      expect(res.status).toBe(403)
      expect(res.headers.get('set-cookie')).toBeNull()
      const html = await res.text()
      expect(html).toContain(L.previewOnly)
      expect(html).not.toContain('Buy 2 Kola Bright')
    }

    // Were a request ever to reach the real routes at the preview's code, there is no link there to count on.
    expect((await realClaim(post('/o/preview/claim'), params(PREVIEW_CODE))).status).toBe(410)
    expect((await realDetails(post('/o/preview/details', FRIEND), params(PREVIEW_CODE))).status).toBe(410)
    expect((await realShare(new Request(`${ORIGIN}/o/preview/share?via=sms`), params(PREVIEW_CODE))).status).toBe(410)
    expect((await realPage(new Request(`${ORIGIN}/o/preview`), params(PREVIEW_CODE))).status).toBe(410)

    expect(await written()).toEqual(before)
  })

  it('no link code can ever be the preview code', async () => {
    const { root } = await seed()
    expect(root).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/)
    expect(PREVIEW_CODE).not.toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/)
  })
})
