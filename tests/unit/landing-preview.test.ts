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
import { campaignDefaults, newCampaignDefaults } from '@/components/campaign/form/values'
import { formPreview } from '@/components/campaign/form/preview'
import { offerPreview, sampleShareLink } from '@/lib/campaign-card'
import { COPY } from '@/lib/copy'
import { db } from '@/lib/db'
import { type LandingView, renderLanding, renderShareSheet } from '@/lib/landing/render'
import { PREVIEW_CODE, previewLanding, previewLandingView, previewShareSheet, shareMessage } from '@/lib/landing/preview'
import { landingCss } from '@/lib/landing/styles'
import { endedView, errorView, viewFor } from '@/lib/landing/view'
import { linkUrl, mintRootLink } from '@/lib/links'
import { previewOffersFor } from '@/lib/offers'
import { creativeUrl } from '@/lib/image-rules'

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

// The real page as visitors get it (no preview flag), pinned whole: any change to its markup shows up here. Every page
// carries the same stylesheet, so it is pinned once and stands as {landingCss} in each page's snapshot.
describe('the real landing page, golden', () => {
  const real = view({
    imageUrl: '/uploads/0b5c8a4e-6f1d-4c1e-9a55-2f1b8f7c9d10.jpg', color: '#0F766E', claimCode: 'KOLA2X1',
    myUrl: `${ORIGIN}/o/ZZZZZZZZ`,
    shareTargets: { whatsapp: '/o/ZZZZZZZZ/share?via=whatsapp', sms: '/o/ZZZZZZZZ/share?via=sms', x: '/o/ZZZZZZZZ/share?via=x' },
  })
  const golden = (html: string) => {
    const style = `<style>${landingCss}</style>`
    expect(html).toContain(style)
    return html.replace(style, '<style>{landingCss}</style>')
  }

  it('stylesheet', () => expect(landingCss).toMatchInlineSnapshot(`"*{box-sizing:border-box}body{margin:0;background:#F6F7F9;color:#14171D;font:15px/1.45 -apple-system,"Segoe UI",system-ui,Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%}main{max-width:480px;margin:0 auto;padding:16px 16px 32px}.art{display:block;width:100%;aspect-ratio:16/9;border-radius:14px;object-fit:cover;background:#F0F1F4}.tile{display:flex;align-items:center;justify-content:center;color:#FFFFFF;font-size:40px;font-weight:800}.brand{margin:16px 0 4px;font-size:13px;color:#5B6170;overflow-wrap:anywhere}h1{margin:0;font-size:22px;line-height:1.25;font-weight:700;overflow-wrap:anywhere}h2{margin:0;font-size:17px;line-height:1.3}h3{margin:16px 0 0;font-size:15px}p{margin:0;overflow-wrap:anywhere}.desc{margin-top:8px;font-size:15px}.reward{display:flex;align-items:center;gap:6px;margin-top:12px;color:#FF5A1F;font-weight:600}.reward svg{flex:none;width:16px;height:16px}.ends{margin-top:4px;font-size:13px;color:#5B6170}form{margin:0}.btn{display:block;width:100%;margin-top:16px;padding:14px 16px;border:1px solid #E6E8EE;border-radius:14px;font:inherit;font-size:16px;font-weight:600;text-align:center;text-decoration:none;cursor:pointer}.primary{background:#FF5A1F;border-color:#FF5A1F;color:#FFFFFF}.secondary{background:#FFFFFF;color:#14171D}.stack .btn{margin-top:8px}.code{margin-top:16px;padding:16px;border:1px dashed #FFD9C8;border-radius:14px;background:#FFF1EB;text-align:center;font:700 24px/1.2 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.08em;overflow-wrap:anywhere;user-select:all}.code small{display:block;margin-bottom:6px;font:400 13px/1.3 -apple-system,"Segoe UI",system-ui,Helvetica,Arial,sans-serif;letter-spacing:0;color:#5B6170}section{margin-top:24px;padding:16px;border:1px solid #E6E8EE;border-radius:14px;background:#FFFFFF}.lead{margin-top:4px;font-size:14px;color:#5B6170}label{display:block;margin:12px 0 4px;font-size:13px;color:#5B6170}input{display:block;width:100%;padding:12px;border:1px solid #E6E8EE;border-radius:14px;background:#FFFFFF;color:#14171D;font:inherit;font-size:16px}.error{margin-top:12px;padding:10px 12px;border-radius:14px;background:#FDE8E8;color:#C53030;font-size:14px}.status{margin-top:32px;font-size:17px;text-align:center;color:#5B6170}.status .brand{margin-top:0}"`))
  it('offer', () => expect(golden(renderLanding(real))).toMatchInlineSnapshot(`"<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Kola Bright: Buy 2 Kola Bright, get 1 free</title><style>{landingCss}</style></head><body><main><img class="art" src="/uploads/0b5c8a4e-6f1d-4c1e-9a55-2f1b8f7c9d10.jpg" alt="" width="480" height="270"><p class="brand">Kola Bright</p><h1>Buy 2 Kola Bright, get 1 free</h1><p class="desc">At any Kola Bright stockist.</p><p class="reward"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 7v14"/><path d="M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8"/><path d="M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5"/><rect x="3" y="7" width="18" height="4" rx="1"/></svg>Earn ₦50 airtime</p><p class="ends">Offer ends 21 Nov</p><form method="post" action="/o/ABCDEFGH/claim"><button class="btn primary">Show my code</button></form><section><h2>Share and earn</h2><p class="reward"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 7v14"/><path d="M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8"/><path d="M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5"/><rect x="3" y="7" width="18" height="4" rx="1"/></svg>Earn ₦50 airtime</p><p class="lead">Leave your number to get your own link to pass on.</p><form method="post" action="/o/ABCDEFGH/details"><label for="name">Name (optional)</label><input id="name" name="name" autocomplete="name" maxlength="80"><label for="phone">Mobile number</label><input id="phone" name="phone" type="tel" autocomplete="tel" maxlength="20" required><button class="btn secondary">Get my link</button></form></section></main></body></html>"`))
  it('code', () => expect(golden(renderLanding({ ...real, state: 'code' }))).toMatchInlineSnapshot(`"<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Kola Bright: Buy 2 Kola Bright, get 1 free</title><style>{landingCss}</style></head><body><main><img class="art" src="/uploads/0b5c8a4e-6f1d-4c1e-9a55-2f1b8f7c9d10.jpg" alt="" width="480" height="270"><p class="brand">Kola Bright</p><h1>Buy 2 Kola Bright, get 1 free</h1><p class="desc">At any Kola Bright stockist.</p><p class="reward"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 7v14"/><path d="M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8"/><path d="M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5"/><rect x="3" y="7" width="18" height="4" rx="1"/></svg>Earn ₦50 airtime</p><p class="ends">Offer ends 21 Nov</p><p class="code"><small>Your code</small>KOLA2X1</p><section><h2>Share and earn</h2><p class="reward"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 7v14"/><path d="M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8"/><path d="M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5"/><rect x="3" y="7" width="18" height="4" rx="1"/></svg>Earn ₦50 airtime</p><p class="lead">Leave your number to get your own link to pass on.</p><form method="post" action="/o/ABCDEFGH/details"><label for="name">Name (optional)</label><input id="name" name="name" autocomplete="name" maxlength="80"><label for="phone">Mobile number</label><input id="phone" name="phone" type="tel" autocomplete="tel" maxlength="20" required><button class="btn secondary">Get my link</button></form></section></main></body></html>"`))
  it('shared', () => expect(golden(renderLanding({ ...real, state: 'shared' }))).toMatchInlineSnapshot(`"<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Kola Bright: Buy 2 Kola Bright, get 1 free</title><style>{landingCss}</style></head><body><main><img class="art" src="/uploads/0b5c8a4e-6f1d-4c1e-9a55-2f1b8f7c9d10.jpg" alt="" width="480" height="270"><p class="brand">Kola Bright</p><h1>Buy 2 Kola Bright, get 1 free</h1><p class="desc">At any Kola Bright stockist.</p><p class="reward"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 7v14"/><path d="M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8"/><path d="M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5"/><rect x="3" y="7" width="18" height="4" rx="1"/></svg>Earn ₦50 airtime</p><p class="ends">Offer ends 21 Nov</p><form method="post" action="/o/ABCDEFGH/claim"><button class="btn primary">Show my code</button></form><section><h2>Share and earn</h2><p class="reward"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 7v14"/><path d="M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8"/><path d="M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5"/><rect x="3" y="7" width="18" height="4" rx="1"/></svg>Earn ₦50 airtime</p><h3>Your link</h3><div class="stack"><a class="btn secondary" href="/o/ZZZZZZZZ/share?via=whatsapp">WhatsApp</a><a class="btn secondary" href="/o/ZZZZZZZZ/share?via=sms">SMS</a><a class="btn secondary" href="/o/ZZZZZZZZ/share?via=x">X</a></div><label for="mylink">Or copy your link</label><input id="mylink" readonly value="http://localhost:3101/o/ZZZZZZZZ"></section></main></body></html>"`))
  it('ended', () => expect(golden(renderLanding(endedView('Kola Bright')))).toMatchInlineSnapshot(`"<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Kola Bright: This offer has ended</title><style>{landingCss}</style></head><body><main><div class="status"><p class="brand">Kola Bright</p><p>This offer has ended</p></div></main></body></html>"`))
  it('error', () => expect(golden(renderLanding(errorView()))).toMatchInlineSnapshot(`"<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Something went wrong on our side. Try again in a minute.</title><style>{landingCss}</style></head><body><main><div class="status"><p>Something went wrong on our side. Try again in a minute.</p></div></main></body></html>"`))
})

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

  it("is the real page's view for the form's values too: the Review step and Edit offer go through the same builder", async () => {
    const key = '0b6f2a8e-3c1d-4e5f-9a7b-1c2d3e4f5a6b.jpg'
    const lagos = { startsAt: new Date('2026-11-07T23:00:00Z'), endsAt: new Date('2026-11-21T23:00:00Z') }
    // The form always holds a tile colour (Edit offer opens a campaign with none on the first), so no null case here.
    for (const over of [{ creativeImageKey: key }, { tileColor: '#7C3AED' }, { redeemMethod: 'link' as const, linkUrl: 'https://kolabright.ng' }]) {
      const { campaign, root } = await seed({ ...lagos, ...over })
      const link = await db.shareLink.findUniqueOrThrow({ where: { code: root }, include: { campaign: true } })
      const { code, ...real } = viewFor(link, 'offer')
      expect(code).toBe(root)
      const values = campaignDefaults(campaign, creativeUrl)
      expect(previewLandingView(formPreview(values, campaign.id, sampleShareLink()), 'offer')).toEqual({ ...real, code: PREVIEW_CODE, preview: true })
    }
  })

  it('says "Your headline" for a form with no headline yet, as the wall does, never an empty heading', () => {
    const values = { ...newCampaignDefaults({ name: 'Kola Bright', type: 'Brand', country: 'NG' }), headline: '  ' }
    const draft = formPreview(values, '__draft', `${ORIGIN}/o/preview`)
    expect(previewLanding(draft, 'offer')).toContain(`<h1>${COPY.preview.headline}</h1>`)
    expect(previewLanding(draft, 'offer')).not.toContain('<h1></h1>')
    expect(shareMessage(draft)).toBe(`Kola Bright: ${COPY.preview.headline} ${ORIGIN}/o/preview`)
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
