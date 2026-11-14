import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PhoneScreen } from '@/components/campaign/PhoneFrame'
import type { PreviewOffer } from '@/lib/preview-merge'

const offer = (id: string, placement: PreviewOffer['placement'] = 'card', extra: Partial<PreviewOffer> = {}): PreviewOffer => ({
  id,
  brand: `Brand ${id}`,
  headline: `Offer ${id}`,
  category: 'Retail',
  placement,
  ageGated: false,
  creative: { image: null, video: null, color: '#0F766E' },
  ...extra,
})

const html = (mine: PreviewOffer, live: PreviewOffer[]) =>
  renderToStaticMarkup(<PhoneScreen mine={mine} live={live} country="Nigeria" />)

describe('PhoneScreen', () => {
  it('draws the wall with the previewed card outlined', () => {
    const out = html(offer('m'), [offer('a'), offer('f', 'featured')])
    expect(out).toContain('phoenix://offers')
    expect(out).toContain('>Offers<')
    expect(out).toContain('Nigeria')
    for (const chip of ['All', 'Food &amp; drink', 'Personal care', 'Banking &amp; fintech']) expect(out).toContain(`>${chip}<`)
    expect(out).toMatch(/class="pc mine"[^>]*>(?:(?!class="pc).)*Brand m · Sponsored/)
    expect(out).toContain('Featured · Brand f · Sponsored')
    expect(out).not.toContain('Skip')
  })

  it('shows the headline placeholder and 18+ in the caption', () => {
    expect(html(offer('m', 'card', { headline: '' }), [])).toContain('Your headline')
    expect(html(offer('m', 'featured', { ageGated: true }), [])).toContain('Featured · Brand m · Sponsored · 18+')
  })

  it('takes the screen over with a Skip chip for a splash', () => {
    const out = html(offer('m', 'splash'), [offer('a')])
    expect(out).toContain('class="splash"')
    expect(out).toContain('>Skip<')
    expect(out).toContain('Splash · Brand m · Sponsored')
  })

  it('draws a play badge over a video poster', () => {
    const out = html(offer('m', 'video', { creative: { image: null, video: '/uploads/v.mp4', color: '#111827' } }), [])
    expect(out).toContain('▶')
    expect(out).toContain('class="feat mine"')
  })

  it('draws every creative from the offer: an image or a first frame in a grid tile, else its tile colour and initials', () => {
    const live = [
      offer('img', 'card', { creative: { image: '/uploads/a.jpg', video: null, color: '#0F766E' } }),
      offer('vid', 'card', { creative: { image: null, video: '/uploads/v.mp4', color: '#111827' } }),
      offer('none', 'card', { creative: { image: null, video: null, color: null } }),
    ]
    const out = html(offer('m'), live)
    expect(out).toContain('<div class="tl" style="background-image:url(&quot;/uploads/a.jpg&quot;)"></div>')
    expect(out).toContain('<div class="tl" style="background:#111827"><video src="/uploads/v.mp4#t=0.1" aria-label="" muted=""')
    // An offer with no colour of its own takes the wall's first tile colour, as the landing page does.
    expect(out).toContain('<div class="tl" style="background:#FF5A1F">BN</div>')
  })
})
