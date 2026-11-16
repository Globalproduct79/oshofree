import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { draftCard } from '@/components/campaign/form/draft-card'
import { formProblem } from '@/components/campaign/form/problem'
import { ReviewStep } from '@/components/campaign/form/ReviewStep'
import { newCampaignDefaults, type FormValues } from '@/components/campaign/form/values'
import { parseDraft, saveDraft, storedDraft } from '@/lib/draft-store'
import type { PreviewOffer } from '@/lib/preview-merge'
import { tokens } from '@/lib/tokens'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

// The New campaign form's Review step (Prompt 6): a read-only summary of everything the campaign will be, with the
// confirmation, before "Submit for review". The node harness has no DOM, so these read the static markup as the
// screen shows it.

const NOW = new Date('2026-11-14T09:00:00Z')
const IMAGE = '0b6f2a8e-3c1d-4e5f-9a7b-1c2d3e4f5a6b.jpg'
const VIDEO = '0b6f2a8e-3c1d-4e5f-9a7b-1c2d3e4f5a6b.mp4'
const kola = { name: 'Kola Bright', type: 'Brand', country: 'NG' } as const

// Kola Bright's Harmattan sale, filled in: a Wall card with an image, a link offer, $300 for 14 days from 15 Nov.
const filled = (over: Partial<FormValues> = {}): FormValues => ({
  ...newCampaignDefaults(kola, NOW),
  name: 'Harmattan sale',
  headline: 'Harmattan sale: 20% off 1L bottles',
  description: 'Show your claim code at any participating store for 20% off a 1L Kola Bright.',
  linkUrl: 'https://kolabright.example/harmattan',
  creative: { key: IMAGE, kind: 'image', url: `/uploads/${IMAGE}` },
  ...over,
})

const mine = (v: FormValues): PreviewOffer => ({
  id: '__draft', brand: v.brand, headline: v.headline, category: v.category, placement: v.placement, ageGated: false,
  creative: { image: v.creative?.kind === 'image' ? v.creative.url : null, video: v.creative?.kind === 'video' ? v.creative.url : null, color: v.tileColor },
})

const credit = { limitCents: 150_000, inUseCents: 0 }
const render = (v: FormValues, cpmCents: number | null = 120, fxPerUsd: number | null = 1550) =>
  renderToStaticMarkup(<ReviewStep values={v} cpmCents={cpmCents} fxPerUsd={fxPerUsd} credit={credit} mine={mine(v)} update={vi.fn()} />)

const text = (m: string) =>
  m.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim()
// The label and value of every key-value cell, in order.
const cells = (m: string) => [...m.matchAll(/<div><small>(.*?)<\/small><b>(.*?)<\/b><\/div>/g)].map((c) => [text(c[1]), text(c[2])])
const section = (m: string, title: string) => {
  const from = m.indexOf(`>${title}</b>`)
  return from < 0 ? '' : m.slice(from + 1, m.indexOf('</section>', from))
}

describe('the Review step', () => {
  it('names itself and says nothing is sent until the submit', () => {
    const m = render(filled())
    expect(m).toContain('<h3 tabindex="-1">Review your campaign</h3>')
    expect(text(m)).toContain('Nothing goes to Global until you submit. Go back to change anything.')
  })

  it('summarises every field: the offer, its creative, its targeting, its money with the estimate, and the confirmation', () => {
    const m = render(filled())
    expect(cells(section(m, 'The offer'))).toEqual([
      ['Campaign name', 'Harmattan sale'],
      ['Brand', 'Kola Bright'],
      ['Category', 'Food & drink'],
      ['Offer headline', 'Harmattan sale: 20% off 1L bottles'],
      ['How consumers redeem', 'Send them to our site / app'],
      ['Link', 'https://kolabright.example/harmattan'],
    ])
    expect(text(section(m, 'The offer'))).toContain('Show your claim code at any participating store for 20% off a 1L Kola Bright.')
    expect(section(m, 'Creative')).toContain(`<img src="/uploads/${IMAGE}" alt="The image you attached" class="cr"/>`)
    expect(cells(section(m, 'Targeting'))).toEqual([
      ['Country', 'Nigeria'],
      ['Placement', 'Wall card · $1.20 CPM'],
      ['Age gate', 'None'],
      ['Flight', '15 Nov – 29 Nov · 14 days'],
    ])
    const money = section(m, 'Money')
    expect(cells(money)).toEqual([
      ['Budget (USD)', '$300 · ₦465,000'],
      ['Share reward', '₦50 airtime per successful share'],
    ])
    // The Cost box's estimate, as the form's right column draws it.
    expect(money).toContain('<div class="est"><small>Estimated impressions</small><b>200.0k</b>')
    expect(text(money)).toContain('Credit after $1,200 left')
    // The confirmation is given here, unticked.
    expect(m).toMatch(/<label class="chk"><input type="checkbox"\/> This offer is genuine, available in the country and dates above, and the brand will honour it.<\/label>/)
  })

  it('a code offer has no link; a betting offer shows 18+ and its licence number; a custom flight ends on its date', () => {
    const m = render(filled({
      category: 'Betting', redeemMethod: 'code', linkUrl: '', description: 'Bet ₦100, win ₦1m. NLRC licence 0042.',
      runsFor: 'custom', startsAt: '2026-11-15', endsAt: '2026-12-01',
    }))
    expect(cells(section(m, 'The offer')).map(([label]) => label)).not.toContain('Link')
    expect(cells(section(m, 'The offer'))).toContainEqual(['How consumers redeem', 'Claim code shown in store'])
    expect(cells(section(m, 'Targeting'))).toEqual([
      ['Country', 'Nigeria'],
      ['Placement', 'Wall card · $1.20 CPM'],
      ['Age gate', '18+ on the card'],
      ['Licence or approval number', 'In the description ✓'],
      ['Flight', '15 Nov – 1 Dec · 16 days'],
    ])
  })

  it('plays a video creative with its controls', () => {
    const m = render(filled({ placement: 'video', creative: { key: VIDEO, kind: 'video', url: `/uploads/${VIDEO}` } }), 300)
    expect(section(m, 'Creative')).toContain(
      `<video src="/uploads/${VIDEO}#t=0.1" aria-label="The video you attached" controls="" playsInline="" preload="metadata" class="cr"></video>`,
    )
    expect(cells(section(m, 'Targeting'))).toContainEqual(['Placement', 'Video · $3.00 CPM'])
  })

  it('shows a splash on a phone, as Phoenix opens it', () => {
    const m = render(filled({ placement: 'splash' }), 500)
    expect(section(m, 'Creative')).toContain('<div class="phone-thumb" role="img" aria-label="Your splash on a phone">')
  })

  it('says so when there is no creative: the card shows the tile colour and initials', () => {
    const m = render(filled({ creative: null }))
    expect(text(section(m, 'Creative'))).toBe('Creative No image. The card shows your tile colour and initials.')
  })

  it('prints a dash where a rate is missing, as the Cost box does', () => {
    const m = render(filled(), null, null)
    expect(cells(section(m, 'Targeting'))).toContainEqual(['Placement', 'Wall card'])
    expect(cells(section(m, 'Money'))).toContainEqual(['Budget (USD)', '$300'])
    expect(section(m, 'Money')).toContain('<b>—</b>')
  })
})

describe('formProblem: what stops the primary button', () => {
  const ctx = { workspace: { type: 'Brand' as const, declined: false }, credit, cpmCents: 120, fxPerUsd: 1550, now: NOW }

  it("a new campaign's edit step asks for every rule but the confirmation, which the Review step asks for", () => {
    expect(formProblem({ ...ctx, values: filled(), isNew: true, stage: 'edit' })).toBeNull()
    expect(formProblem({ ...ctx, values: filled(), isNew: true, stage: 'review' })).toBe('Confirm the offer is genuine.')
    expect(formProblem({ ...ctx, values: filled({ termsAccepted: true }), isNew: true, stage: 'review' })).toBeNull()
  })

  it('the edit step still names the first rule that fails', () => {
    expect(formProblem({ ...ctx, values: filled({ name: '' }), isNew: true, stage: 'edit' })).toBe('Give the campaign a name.')
    expect(formProblem({ ...ctx, values: filled({ budgetUsd: '20' }), isNew: true, stage: 'edit' })).toBe('Minimum budget is $50.')
  })

  it('Edit offer keeps its confirmation on the one page', () => {
    const edit = { running: false, heldCents: 0 }
    expect(formProblem({ ...ctx, values: filled(), isNew: false, stage: 'edit', edit })).toBe('Confirm the offer is genuine.')
  })

  it('then a missing rate, a missing exchange rate, and a declined workspace', () => {
    const v = filled({ termsAccepted: true })
    expect(formProblem({ ...ctx, values: v, isNew: true, stage: 'review', cpmCents: null })).toBe(
      'No rate is set for this placement in Nigeria yet. Ask Global.',
    )
    expect(formProblem({ ...ctx, values: v, isNew: true, stage: 'review', fxPerUsd: null })).toBe(
      'No exchange rate is set for Nigeria yet. Ask Global.',
    )
    expect(formProblem({ ...ctx, values: v, isNew: true, stage: 'edit', workspace: { type: 'Brand', declined: true } })).toBe(
      "Your workspace was declined, so campaigns can't be submitted.",
    )
  })
})

describe('the draft on Campaigns home', () => {
  it('is a Draft card with its headline, the image it has, where it is kept, and the way back into the form', () => {
    expect(draftCard(filled())).toEqual({
      headline: 'Harmattan sale: 20% off 1L bottles',
      brand: 'Kola Bright',
      country: 'Nigeria',
      status: 'draft',
      placement: 'card',
      ageGated: false,
      imageUrl: `/uploads/${IMAGE}`,
      color: tokens.tileColors[0],
      initials: 'KB',
      mainLeft: 'Saved in this browser',
      mainRight: 'Carry on',
    })
  })

  it('falls back to the campaign name, then "Untitled draft"; a video draft keeps the tile colour', () => {
    expect(draftCard(filled({ headline: ' ' })).headline).toBe('Harmattan sale')
    expect(draftCard(filled({ headline: '', name: '' })).headline).toBe('Untitled draft')
    const video = draftCard(filled({ placement: 'video', creative: { key: VIDEO, kind: 'video', url: `/uploads/${VIDEO}` } }))
    expect(video.imageUrl).toBeNull()
  })

  it("is read from this browser without dropping another workspace's draft", () => {
    const m = new Map<string, string>()
    const storage = {
      get length() { return m.size },
      key: (i: number) => [...m.keys()][i] ?? null,
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    }
    vi.stubGlobal('window', { localStorage: storage })
    try {
      const defaults = newCampaignDefaults(kola, NOW)
      saveDraft('ws1', filled())
      saveDraft('ws2', { ...defaults, name: 'Other' })
      expect(parseDraft(storedDraft('ws1'), 'ws1', defaults)?.headline).toBe('Harmattan sale: 20% off 1L bottles')
      expect(storedDraft('ws3')).toBeNull()
      expect(m.has('of-draft:ws2')).toBe(true)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
