import type { ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { PlacementFields } from '@/components/campaign/form/PlacementFields'
import { newCampaignDefaults, type FormValues } from '@/components/campaign/form/values'
import { CreativePicker } from '@/components/og'
import type { PreviewOffer } from '@/lib/preview-merge'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

// The creative picker's states, each as the page draws it (the trip through /api/upload is creative-upload.test.ts).

const props: ComponentProps<typeof CreativePicker> = {
  label: 'Ad image',
  hint: '— optional. Square or landscape works best.',
  zoneTitle: 'Upload image',
  zoneHint: 'tap to attach a sample (demo)',
  accept: 'image/jpeg,image/png,image/webp',
  onPick: vi.fn(),
  onRemove: vi.fn(),
  onRetry: vi.fn(),
}
const html = (extra: Partial<ComponentProps<typeof CreativePicker>> = {}) => renderToStaticMarkup(<CreativePicker {...props} {...extra} />)
// The live region the picker speaks through: present from the start, so a screen reader hears what lands in it.
const live = (m: string) => /<span aria-live="polite">([^<]*)<\/span>/.exec(m)?.[1]

describe('CreativePicker', () => {
  it('idle: the label for the file input, the zone as a button, only the placement\'s types, an empty live region', () => {
    const m = html()
    expect(m).toMatch(/<label class="f" for="([^"]+)">Ad image <small>— optional\. Square or landscape works best\.<\/small><\/label>/)
    expect(m).toMatch(/<div class="drop" data-state="idle" role="button" tabindex="0"[^>]*>/)
    expect(m).toContain('<b style="color:#14171D">Upload image</b><br/>tap to attach a sample (demo)')
    expect(m).toMatch(/<input [^>]*type="file" [^>]*accept="image\/jpeg,image\/png,image\/webp"[^>]*hidden=""/)
    expect(live(m)).toBe('')
    expect(m).not.toContain('>Replace<')
  })

  it('a refused file: the sentence is read out, the zone stays a button, and there is no Retry', () => {
    const m = html({ status: { state: 'error', message: 'That file is a GIF. Use a JPG, PNG or WebP.', retry: false } })
    expect(m).toContain('class="dmsg bad"')
    expect(live(m)).toBe('That file is a GIF. Use a JPG, PNG or WebP.')
    expect(m).toMatch(/class="drop" data-state="idle" role="button"/)
    expect(m).not.toContain('>Retry<')
  })

  it('uploading: the chosen file\'s own preview, a bar at the percentage and the percentage in words; nothing to press', () => {
    const m = html({ status: { state: 'uploading', percent: 42, preview: { url: 'blob:abc', kind: 'image' } } })
    expect(m).toMatch(/class="drop" data-state="uploading" aria-busy="true"/)
    expect(m).not.toMatch(/data-state="uploading"[^>]*role="button"/)
    expect(m).toContain('<img src="blob:abc" alt="The image you chose"/>')
    expect(m).toMatch(/<div class="bar" role="progressbar" aria-label="Uploading" aria-valuemin="0" aria-valuemax="100" aria-valuenow="42"><i style="width:42%"><\/i><\/div>/)
    expect(live(m)).toBe('Uploading… 42%')
    expect(m).not.toContain('>Replace<')
  })

  it('a failed upload: the message with Retry beside it', () => {
    const m = html({ status: { state: 'error', message: "The upload didn't finish. Try again.", retry: true } })
    expect(live(m)).toBe('The upload didn&#x27;t finish. Try again.')
    expect(m).toContain('<button class="btn s" type="button">Retry</button>')
  })

  it('a failed replace keeps the creative already chosen, with its buttons', () => {
    const m = html({
      chosen: { url: '/uploads/a.png', kind: 'image' },
      status: { state: 'error', message: "The upload didn't finish. Try again.", retry: true },
    })
    expect(m).toContain('<img src="/uploads/a.png"')
    expect(m).toContain('>Replace</button>')
    expect(m).toContain('>Retry</button>')
  })

  it('a chosen image: the image itself, then Replace and Remove; the zone is no longer a button', () => {
    const m = html({ chosen: { url: '/uploads/a.png', kind: 'image' } })
    expect(m).toMatch(/<div class="drop" data-state="chosen"><img src="\/uploads\/a.png" alt="The image you chose"\/><\/div>/)
    expect(m).toContain(
      '<div class="btns dacts"><button class="btn s" type="button">Replace</button><button class="btn g s" type="button">Remove</button></div>',
    )
    expect(m).not.toContain('Upload image')
  })

  it('a chosen video plays with native controls, from its first frame, not muted on a loop', () => {
    const m = html({ chosen: { url: '/uploads/a.mp4', kind: 'video' }, accept: 'video/mp4' })
    expect(m).toContain('<video src="/uploads/a.mp4#t=0.1" aria-label="The video you chose" controls="" playsInline="" preload="metadata"></video>')
    expect(m).not.toContain('muted')
    expect(m).not.toContain('autoPlay')
  })

  it('a chosen splash: the frame the caller draws, and its action after Replace and Remove', () => {
    const m = html({
      chosen: { url: '/uploads/a.png', kind: 'image' },
      frame: <div className="phone-thumb">phone</div>,
      actions: <button type="button">View full size</button>,
    })
    expect(m).toContain('<div class="drop" data-state="chosen"><div class="phone-thumb">phone</div></div>')
    expect(m).toContain('>Remove</button><button type="button">View full size</button></div>')
  })

  it('a note (a placement switch took the creative off) is read out, not as an error', () => {
    const m = html({ status: { state: 'idle', note: 'The video was removed — a Wall card shows an image.' } })
    expect(m).toContain('class="dmsg"')
    expect(live(m)).toBe('The video was removed — a Wall card shows an image.')
  })
})

describe('PlacementFields: the picker each placement asks for', () => {
  const values = (patch: Partial<FormValues>): FormValues => ({
    ...newCampaignDefaults({ name: 'Kola Bright', type: 'Brand', country: 'NG' }),
    ...patch,
  })
  const mine: PreviewOffer = {
    id: '__draft', brand: 'Kola Bright', headline: 'h', category: 'Retail', placement: 'splash', ageGated: false,
    creative: { image: '/uploads/s.png', video: null, color: '#FF5A1F' },
  }
  const draw = (patch: Partial<FormValues>, offer: PreviewOffer = mine) =>
    renderToStaticMarkup(
      <PlacementFields
        values={values(patch)}
        cpmCents={{ card: 100, featured: 200, video: 300, splash: 400 }}
        choose={vi.fn()}
        status={{ state: 'idle' }}
        pick={vi.fn()}
        retry={vi.fn()}
        remove={vi.fn()}
        mine={{ ...offer, placement: patch.placement ?? 'card' }}
        loadLive={async () => []}
      />,
    )

  it('a Wall card or Featured tile takes a JPG, PNG or WebP and shows it as it is', () => {
    for (const placement of ['card', 'featured'] as const) {
      const m = draw({ placement, creative: { key: 'k.png', kind: 'image', url: '/uploads/k.png' } })
      expect(m).toMatch(/accept="image\/jpeg,image\/png,image\/webp"/)
      expect(m).toContain('<img src="/uploads/k.png" alt="The image you chose"/>')
      expect(m).not.toContain('View full size')
    }
  })

  it('Video takes an MP4 and plays it with controls', () => {
    const m = draw({ placement: 'video', creative: { key: 'k.mp4', kind: 'video', url: '/uploads/k.mp4' } })
    expect(m).toMatch(/accept="video\/mp4"/)
    expect(m).toContain('<video src="/uploads/k.mp4#t=0.1"')
    expect(m).toContain('controls=""')
    expect(m).toContain('— MP4, 6–15 s, under 25 MB. Required.')
  })

  it('Splash takes an image or an MP4 and shows it full screen in a small phone, with View full size', () => {
    const m = draw({ placement: 'splash', creative: { key: 's.png', kind: 'image', url: '/uploads/s.png' } })
    expect(m).toMatch(/accept="image\/jpeg,image\/png,image\/webp,video\/mp4"/)
    expect(m).toMatch(/<div class="phone-thumb" role="img" aria-label="Your splash on a phone"><div inert="">\s*<div class="phone">/)
    expect(m).toMatch(/class="splash"[^>]*><img src="\/uploads\/s.png"/)
    expect(m).toContain('>View full size</button>')
    expect(m).toContain('— portrait image under 4 MB, or an MP4 under 25 MB. Required.')
  })

  it('a splash video sits in the phone as a still first frame, without controls at that size', () => {
    const m = draw(
      { placement: 'splash', creative: { key: 's.mp4', kind: 'video', url: '/uploads/s.mp4' } },
      { ...mine, creative: { image: null, video: '/uploads/s.mp4', color: '#FF5A1F' } },
    )
    expect(m).toMatch(/class="phone-thumb"[^]*<video src="\/uploads\/s.mp4#t=0.1" muted="" playsInline="" preload="metadata"><\/video>/)
  })

  it('with nothing chosen, Splash shows the zone, not the phone', () => {
    const m = draw({ placement: 'splash', creative: null })
    expect(m).not.toContain('phone-thumb')
    expect(m).toContain('Upload creative')
  })
})
