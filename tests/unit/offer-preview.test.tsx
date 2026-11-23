import type { Campaign, Prisma } from '@prisma/client'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { PhonePreview } from '@/components/campaign/PhonePreview'
import { PreviewBody } from '@/components/campaign/PreviewBody'
import { formPreview } from '@/components/campaign/form/preview'
import { newCampaignDefaults, previewEndsAt, type FormValues } from '@/components/campaign/form/values'
import { moveTab, PREVIEW_TABS, startTab, tabApplies, type PreviewTab } from '@/components/campaign/preview-tabs'
import { offerPreview } from '@/lib/campaign-card'
import { COPY } from '@/lib/copy'
import { db } from '@/lib/db'
import { previewLanding, previewShareSheet, shareMessage } from '@/lib/landing/preview'
import type { PreviewCampaign, PreviewOffer } from '@/lib/preview-merge'

const P = COPY.preview
const L = COPY.landing
const DAY = 86_400_000
const IMAGE = '0b6f2a8e-3c1d-4e5f-9a7b-1c2d3e4f5a6b.jpg'
const CLIP = '7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f.mp4'
const PLACEMENTS = ['card', 'featured', 'video', 'splash'] as const

// A Kola Bright offer as the form would have stored it; the placement and creative vary by test.
async function seeded(over: Partial<Prisma.CampaignUncheckedCreateInput> = {}): Promise<Campaign> {
  const ws = await db.workspace.create({ data: { name: 'Kola Bright', type: 'Brand', country: 'NG', status: 'approved' } })
  return db.campaign.create({
    data: {
      workspaceId: ws.id, name: 'Harmattan sale', brand: 'Kola Bright', country: 'NG', category: 'Food & drink',
      headline: 'Harmattan sale: 20% off 1L bottles', description: 'Show your claim code at any participating store.',
      placement: 'card', redeemMethod: 'code', budgetUsd: 120, rewardLocal: 75, shareRewardLabel: 'Earn ₦75 airtime',
      tileColor: '#2B5FD9', status: 'review', startsAt: new Date(Date.now() + DAY), endsAt: new Date('2026-12-01T23:00:00Z'),
      ...over,
    },
  })
}
const imageCard = () => seeded({ creativeImageKey: IMAGE })
const videoOffer = () => seeded({ placement: 'video', creativeVideoKey: CLIP })
const splashImage = () => seeded({ placement: 'splash', creativeImageKey: IMAGE })
const splashVideo = () => seeded({ placement: 'splash', creativeVideoKey: CLIP })

// Another offer live in Nigeria, around the previewed one on the wall.
const live: PreviewOffer[] = [
  { id: 'other', brand: 'Supa Foods', headline: 'Supa10: 10% off', category: 'Food & drink', placement: 'card', ageGated: false,
    creative: { image: null, video: null, color: '#0F766E' } },
]

const html = (el: ReactElement) => renderToStaticMarkup(el)
const body = (c: PreviewCampaign, tab: PreviewTab, state: 'loading' | 'failed' | 'ready' = 'ready') =>
  html(<PreviewBody campaign={c} tab={tab} live={live} state={state} onTab={() => {}} onClose={() => {}} />)
// The tab button for a label, and the panel the body draws.
const tabOf = (m: string, label: string) => new RegExp(`<button[^>]*role="tab"[^>]*>${label}(?: <i>[^<]*</i>)?</button>`).exec(m)?.[0] ?? ''
const panel = (m: string) => m.slice(m.indexOf('role="tabpanel"'))
const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
const srcdoc = (m: string) => unescape(/<iframe[^>]*srcDoc="([^"]*)"|<iframe[^>]*srcdoc="([^"]*)"/i.exec(m)?.slice(1).find(Boolean) ?? '')

describe('the preview model', () => {
  it("is the campaign's own: card fields, description, reward, redeem, end, market and a sample link", async () => {
    const c = await imageCard()
    expect(offerPreview(c)).toEqual({
      id: c.id, brand: 'Kola Bright', headline: 'Harmattan sale: 20% off 1L bottles', category: 'Food & drink', placement: 'card',
      ageGated: false, creative: { image: `/uploads/${IMAGE}`, video: null, color: '#2B5FD9' },
      description: 'Show your claim code at any participating store.', rewardLabel: 'Earn ₦75 airtime', redeemMethod: 'code',
      endsAt: '2026-12-01T23:00:00.000Z', country: 'NG', sampleLink: 'http://localhost:3101/o/preview',
    })
  })

  it("is the form's values as they will be stored, for a draft", () => {
    const now = new Date('2026-11-14T08:00:00Z')
    const v: FormValues = {
      ...newCampaignDefaults({ name: 'Kola Bright', type: 'Brand', country: 'NG' }, now),
      headline: ' Harmattan sale ', description: ' Show your code. ', rewardLocal: '75', redeemMethod: 'code',
      creative: { key: CLIP, kind: 'video', url: `/uploads/${CLIP}` }, placement: 'video',
    }
    expect(formPreview(v, '__draft', 'http://localhost:3101/o/preview', now)).toEqual({
      id: '__draft', brand: 'Kola Bright', headline: 'Harmattan sale', category: 'Food & drink', placement: 'video', ageGated: false,
      creative: { image: null, video: `/uploads/${CLIP}`, color: v.tileColor },
      description: 'Show your code.', rewardLabel: 'Earn ₦75 airtime', redeemMethod: 'code',
      endsAt: previewEndsAt(v, now).toISOString(), country: 'NG', sampleLink: 'http://localhost:3101/o/preview',
    })
  })
})

describe('the format tabs', () => {
  it('are Wall card, Featured tile, Video, Splash, Landing page and Share, in that order', () => {
    expect(PREVIEW_TABS).toEqual(['card', 'featured', 'video', 'splash', 'landing', 'share'])
  })

  it("open on the campaign's placement; the other placements are off, the page and the share sheet always on", () => {
    for (const placement of PLACEMENTS) {
      expect(startTab(placement)).toBe(placement)
      for (const tab of PREVIEW_TABS) expect(tabApplies(tab, placement)).toBe(tab === placement || tab === 'landing' || tab === 'share')
    }
    // Asked for a tab that does not apply (View full size on a placement since changed), it opens on the placement.
    expect(startTab('card', 'splash')).toBe('card')
    expect(startTab('splash', 'splash')).toBe('splash')
    expect(startTab('card', 'landing')).toBe('landing')
  })

  it('move with the arrow keys, Home and End, over the tabs that apply only', () => {
    expect(moveTab('card', 'ArrowRight', 'card')).toBe('landing')
    expect(moveTab('landing', 'ArrowRight', 'card')).toBe('share')
    expect(moveTab('share', 'ArrowRight', 'card')).toBe('card')
    expect(moveTab('card', 'ArrowLeft', 'card')).toBe('share')
    expect(moveTab('landing', 'ArrowLeft', 'video')).toBe('video')
    expect(moveTab('share', 'Home', 'splash')).toBe('splash')
    expect(moveTab('splash', 'End', 'splash')).toBe('share')
    expect(moveTab('card', 'Enter', 'card')).toBeNull()
  })

  it('are drawn as a tab list: the chosen one selected and in the tab order, the rest reachable by arrows, and the other placements disabled with why', async () => {
    const m = body(offerPreview(await imageCard()), 'card')
    expect(m).toMatch(/<div class="tabs" role="tablist" aria-label="Formats">/)
    const card = tabOf(m, 'Wall card')
    expect(card).toContain('aria-selected="true"')
    expect(card).toContain('tabindex="0"')
    for (const label of ['Featured tile', 'Video', 'Splash']) {
      const t = tabOf(m, label)
      expect(t).toContain('disabled=""')
      expect(t).toContain('aria-selected="false"')
      // A space before the reason, so a screen reader names it "Video Not this placement".
      expect(t).toContain(`${label} <i>${P.notThisPlacement}</i>`)
    }
    for (const label of ['Landing page', 'Share']) {
      const t = tabOf(m, label)
      expect(t).not.toContain('disabled')
      expect(t).toContain('tabindex="-1"')
    }
    const id = /id="([^"]+)"/.exec(card)![1]
    expect(m).toContain(`role="tabpanel" id="${id.replace(/tab-card$/, 'panel')}" aria-labelledby="${id}"`)
  })
})

describe('each tab, drawn from the campaign', () => {
  it("Wall card: the wall, with this card outlined in the grid carrying its image, brand and headline, among the live offers", async () => {
    const c = offerPreview(await imageCard())
    const p = panel(body(c, 'card'))
    expect(p).toContain('phoenix://offers')
    expect(p).toMatch(new RegExp(`class="pc mine"><div class="tl" style="background-image:url\\(&quot;/uploads/${IMAGE}&quot;\\)"></div><div class="bd"><div class="br">Kola Bright · Sponsored</div><div class="ti">Harmattan sale: 20% off 1L bottles</div>`))
    expect(p).toContain('Supa10: 10% off')
    expect(p).toContain(P.lines.card)
    expect(p).toContain(`<p class="ex">${P.explainer}</p>`)
    expect(p).toContain(`>${P.close}</button>`)
  })

  it('Wall card with no creative: the tile colour and initials, as the real wall draws it', async () => {
    const p = panel(body(offerPreview(await seeded()), 'card'))
    expect(p).toContain('class="pc mine"><div class="tl" style="background:#2B5FD9">KB</div>')
  })

  it('Featured tile: the image across the top of the wall, captioned and outlined', async () => {
    const p = panel(body(offerPreview(await seeded({ placement: 'featured', creativeImageKey: IMAGE, ageGated: true })), 'featured'))
    expect(p).toContain(`<div class="feat mine"><img src="/uploads/${IMAGE}" alt=""/>`)
    expect(p).toContain('Featured · Kola Bright · Sponsored · 18+')
    expect(p).toContain(P.lines.featured)
  })

  it('Video: the clip at its first frame in the featured slot, and the clip to play beside the phone', async () => {
    const p = panel(body(offerPreview(await videoOffer()), 'video'))
    expect(p).toMatch(new RegExp(`<div class="feat mine"><video src="/uploads/${CLIP}#t=0.1" aria-label="" muted="" playsInline="" preload="metadata"></video><span class="play" aria-hidden="true">▶</span>`))
    expect(p).toMatch(new RegExp(`<div class="pv-side">.*<video src="/uploads/${CLIP}#t=0.1" aria-label="${COPY.preview.clip}" controls=""`))
    expect(p).toContain(P.lines.video)
  })

  it('Splash: the image over the whole screen with Skip; a video splash plays with its controls', async () => {
    const image = panel(body(offerPreview(await splashImage()), 'splash'))
    expect(image).toContain(`<div class="splash" style="background:#2B5FD9"><img src="/uploads/${IMAGE}" alt=""/><span class="skip">Skip</span></div>`)
    expect(image).toContain(P.lines.splash)
    const video = panel(body(offerPreview(await splashVideo()), 'splash'))
    expect(video).toMatch(new RegExp(`<div class="splash" style="background:#2B5FD9"><video src="/uploads/${CLIP}#t=0.1" aria-label="" controls=""`))
  })

  it('Landing page: the real page of this campaign in the phone, sandboxed, saying nothing is recorded', async () => {
    const c = offerPreview(await imageCard())
    const p = panel(body(c, 'landing'))
    expect(p).toMatch(/<div class="phone"><div class="notch"><\/div><div class="pv-page"><iframe title="The landing page"[^>]* sandbox=""/)
    const page = srcdoc(p)
    expect(page).toBe(previewLanding(c, 'offer'))
    for (const s of ['Harmattan sale: 20% off 1L bottles', 'Show your claim code at any participating store.', 'Earn ₦75 airtime', L.preview, `/uploads/${IMAGE}`])
      expect(page).toContain(s)
    expect(page).toContain(`<button class="btn primary" disabled>${L.showCode}</button>`)
    expect(p).toContain(P.lines.landing)
    expect(p).not.toContain(P.explainer)
  })

  it('Landing page for a video offer: its clip from the first frame, as the real page plays it', async () => {
    const c = offerPreview(await videoOffer())
    const page = srcdoc(panel(body(c, 'landing')))
    expect(page).toBe(previewLanding(c, 'offer'))
    expect(page).toContain(`<video class="art" src="/uploads/${CLIP}#t=0.1" controls playsinline preload="metadata"`)
    expect(page).not.toContain('<div class="art tile"')
  })

  it("Share: the sharer's page with their buttons and the sample link, and the message those buttons send", async () => {
    const c = offerPreview(await imageCard())
    const p = panel(body(c, 'share'))
    expect(p).toMatch(/<iframe title="The share sheet"[^>]* sandbox=""/)
    const page = srcdoc(p)
    expect(page).toBe(previewShareSheet(c))
    for (const s of [L.yourLink, L.whatsapp, L.sms, L.x, L.copyLabel, 'value="http://localhost:3101/o/preview"']) expect(page).toContain(s)
    expect(p).toContain(`<p class="msg">${shareMessage(c)}</p>`)
    expect(shareMessage(c)).toBe('Kola Bright: Harmattan sale: 20% off 1L bottles http://localhost:3101/o/preview')
    expect(p).toContain(P.sample)
  })

  it('says while the live offers load, or that they did not, on the wall tabs only', async () => {
    const c = offerPreview(await imageCard())
    expect(panel(body(c, 'card', 'loading'))).toContain(`<p role="status">${P.loading}</p>`)
    expect(unescape(panel(body(c, 'card', 'failed')))).toContain(`<p role="status">${P.failed}</p>`)
    expect(panel(body(c, 'landing', 'loading'))).not.toContain(P.loading)
  })
})

describe('PhonePreview', () => {
  const sheet = (c: PreviewCampaign, initialTab?: PreviewTab) =>
    html(<PhonePreview campaign={c} live={live} open onOpenChange={vi.fn()} initialTab={initialTab} />)

  it('is a dialog that becomes a full-screen sheet on a phone, opening on the placement', async () => {
    const m = sheet(offerPreview(await splashImage()))
    // React hints a preload for the image ahead of the markup; the dialog follows it.
    expect(m).toMatch(new RegExp(`<div class="modal on"><div class="in sheet" role="dialog" aria-modal="true" aria-labelledby="[^"]+" tabindex="-1"><h3 id="[^"]+">${P.title}</h3><p class="sub">${P.subtitle}</p>`))
    expect(tabOf(m, 'Splash')).toContain('aria-selected="true"')
  })

  it('opens on the tab asked for when it applies', async () => {
    const c = offerPreview(await imageCard())
    expect(tabOf(sheet(c, 'landing'), 'Landing page')).toContain('aria-selected="true"')
    expect(tabOf(sheet(c, 'splash'), 'Wall card')).toContain('aria-selected="true"')
  })

  it('draws nothing while closed', async () => {
    const c = offerPreview(await imageCard())
    expect(html(<PhonePreview campaign={c} live={live} open={false} onOpenChange={vi.fn()} />)).toBe('')
  })
})
