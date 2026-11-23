import type { ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Marked } from '@/components/campaign/form/field'
import { PlacementFields } from '@/components/campaign/form/PlacementFields'
import { newCampaignDefaults, type FormValues } from '@/components/campaign/form/values'
import { CreativePicker } from '@/components/og'
import type { PreviewCampaign } from '@/lib/preview-merge'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

// The creative picker's states, each as the page draws it (the trip through /api/upload is creative-upload.test.ts;
// keys, drops, Retry and focus are picker-logic.test.ts). The node harness has no DOM, so these read the markup the
// way a screen reader would: buttons by their names, the live region, the zone's role, images by their alt text.

const props: ComponentProps<typeof CreativePicker> = {
  label: 'Ad image',
  hint: '— optional. Square or landscape works best.',
  zoneTitle: 'Upload image',
  zoneHint: 'drag a JPG, PNG or WebP here, or choose a file',
  accept: 'image/jpeg,image/png,image/webp',
  onPick: vi.fn(),
  onRemove: vi.fn(),
}
const html = (extra: Partial<ComponentProps<typeof CreativePicker>> = {}) => renderToStaticMarkup(<CreativePicker {...props} {...extra} />)

const attr = (tag: string | undefined, name: string) => (tag ? new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] : undefined)
const text = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&amp;/g, '&')
// Every button's name, in order.
const buttons = (m: string) => [...m.matchAll(/<button\b[^>]*>(.*?)<\/button>/g)].map((b) => text(b[1]))
// What the live region says: present from the start (empty), so a screen reader hears what lands in it.
const live = (m: string) => /<span aria-live="polite">([^<]*)<\/span>/.exec(m)?.[1]
const zone = (m: string) => /<div class="drop"[^>]*>/.exec(m)?.[0]
// The empty zone's own button (a real <button>, filling the dashed box).
const pick = (m: string) => /<button type="button" class="pick"[^>]*>/.exec(m)?.[0]
const ZONE = 'Upload imagedrag a JPG, PNG or WebP here, or choose a file'
const images = (m: string) => [...m.matchAll(/<img\b[^>]*>/g)].map((i) => ({ src: attr(i[0], 'src'), alt: attr(i[0], 'alt') }))
const videos = (m: string) => [...m.matchAll(/<video\b[^>]*>/g)].map((v) => v[0])
const progressbar = (m: string) => /<div class="bar" role="progressbar"[^>]*>/.exec(m)?.[0]

describe('CreativePicker', () => {
  it("idle: the label names the file input, the zone holds a real button, the input takes only the placement's types", () => {
    const m = html()
    const input = /<input [^>]*type="file"[^>]*>/.exec(m)?.[0]
    expect(attr(/<label [^>]*>/.exec(m)?.[0], 'for')).toBe(attr(input, 'id'))
    expect(text(/<label [^>]*>.*?<\/label>/.exec(m)![0])).toBe('Ad image — optional. Square or landscape works best.')
    expect(attr(input, 'accept')).toBe('image/jpeg,image/png,image/webp')
    expect(input).toContain('hidden=""')
    // The box is only the drop target; the button inside it is what a keyboard or a screen reader reaches.
    expect([attr(zone(m), 'role'), attr(zone(m), 'tabindex'), attr(zone(m), 'data-state')]).toEqual([undefined, undefined, 'idle'])
    expect(pick(m)).toBeDefined()
    expect(attr(pick(m), 'aria-invalid')).toBeUndefined()
    expect(live(m)).toBe('')
    expect(buttons(m)).toEqual([ZONE])
  })

  it('a refused file: the sentence is read out in red, the zone stays a button, and there is no Retry', () => {
    const m = html({ status: { state: 'error', message: 'That file is a GIF. Use a JPG, PNG or WebP.', retry: false } })
    expect(m).toContain('class="dmsg bad"')
    expect(live(m)).toBe('That file is a GIF. Use a JPG, PNG or WebP.')
    expect(buttons(m)).toEqual([ZONE])
  })

  it('uploading: the file itself under a progress bar; "Uploading…" is read once, the percentage is on the bar', () => {
    const m = html({ status: { state: 'uploading', percent: 42, preview: { url: 'blob:abc', kind: 'image' } } })
    expect([attr(zone(m), 'data-state'), attr(zone(m), 'aria-busy')]).toEqual(['uploading', 'true'])
    expect(pick(m)).toBeUndefined()
    expect(images(m)).toEqual([{ src: 'blob:abc', alt: 'The image you chose' }])
    const bar = progressbar(m)
    expect([attr(bar, 'aria-label'), attr(bar, 'aria-valuenow'), attr(bar, 'aria-valuemin'), attr(bar, 'aria-valuemax')]).toEqual([
      'Uploading…', '42', '0', '100',
    ])
    expect(m).toContain('<i style="width:42%">')
    expect(live(m)).toBe('Uploading…')
    // Shown beside the words, hidden from screen readers: the bar already says it.
    expect(m).toContain('<span aria-hidden="true">42%</span>')
    expect(buttons(m)).toEqual([])
  })

  it('a failed upload: the message, with Retry', () => {
    const m = html({ status: { state: 'error', message: "The upload didn't finish. Try again.", retry: true } })
    expect(live(m)).toBe('The upload didn&#x27;t finish. Try again.')
    expect(buttons(m)).toEqual([ZONE, 'Retry'])
  })

  it('a failed replace keeps the creative already chosen, with its buttons', () => {
    const m = html({
      chosen: { url: '/uploads/a.png', kind: 'image' },
      status: { state: 'error', message: "The upload didn't finish. Try again.", retry: true },
    })
    expect(images(m)).toEqual([{ src: '/uploads/a.png', alt: 'The image you chose' }])
    expect(buttons(m)).toEqual(['Replace', 'Remove', 'Retry'])
  })

  it('a chosen image: the image itself, then Replace and Remove; the zone is no longer a button', () => {
    const m = html({ chosen: { url: '/uploads/a.png', kind: 'image' }, status: { state: 'idle', note: 'Image attached.' } })
    expect(attr(zone(m), 'data-state')).toBe('chosen')
    expect(pick(m)).toBeUndefined()
    expect(images(m)).toEqual([{ src: '/uploads/a.png', alt: 'The image you chose' }])
    expect(buttons(m)).toEqual(['Replace', 'Remove'])
    expect(live(m)).toBe('Image attached.')
    expect(text(m)).not.toContain('Upload image')
  })

  it('a chosen video plays with native controls, from its first frame, not muted on a loop', () => {
    const [video] = videos(html({ chosen: { url: '/uploads/a.mp4', kind: 'video' }, accept: 'video/mp4' }))
    expect([attr(video, 'src'), attr(video, 'aria-label'), attr(video, 'preload')]).toEqual([
      '/uploads/a.mp4#t=0.1', 'The video you chose', 'metadata',
    ])
    expect(video).toContain('controls=""')
    expect(video).not.toContain('muted')
    expect(video).not.toContain('autoPlay')
  })

  it('a chosen splash: the frame the caller draws, and its action after Replace and Remove', () => {
    const m = html({
      chosen: { url: '/uploads/a.png', kind: 'image' },
      frame: <div className="phone-thumb">phone</div>,
      actions: <button type="button">View full size</button>,
    })
    expect(m).toMatch(/<div class="drop" data-state="chosen"><div class="phone-thumb">phone<\/div><\/div>/)
    expect(images(m)).toEqual([])
    expect(buttons(m)).toEqual(['Replace', 'Remove', 'View full size'])
  })

  it("the form's refusal marks the control there to fix it: the empty zone, else Replace", () => {
    const empty = html({ invalid: 'cf-err-creative' })
    expect([attr(pick(empty), 'aria-invalid'), attr(pick(empty), 'aria-describedby')]).toEqual(['true', 'cf-err-creative'])
    // The dashed box turns red with it.
    expect(attr(zone(empty), 'data-invalid')).toBe('')
    expect(attr(zone(html()), 'data-invalid')).toBeUndefined()
    const chosen = html({ invalid: 'cf-err-creative', chosen: { url: '/uploads/a.png', kind: 'image' } })
    const replace = /<button [^>]*>Replace<\/button>/.exec(chosen)?.[0]
    expect([attr(replace, 'aria-invalid'), attr(replace, 'aria-describedby')]).toEqual(['true', 'cf-err-creative'])
    const remove = /<button [^>]*>Remove<\/button>/.exec(chosen)?.[0]
    expect(attr(remove, 'aria-invalid')).toBeUndefined()
    // Not marked: nothing says invalid.
    expect(html({ chosen: { url: '/uploads/a.png', kind: 'image' } })).not.toContain('aria-invalid')
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
  const mine: PreviewCampaign = {
    id: '__draft', brand: 'Kola Bright', headline: 'h', category: 'Retail', placement: 'splash', ageGated: false,
    creative: { image: '/uploads/s.png', video: null, color: '#FF5A1F' },
    description: 'd', rewardLabel: 'Earn ₦50 airtime', redeemMethod: 'code', endsAt: '2026-12-01T23:00:00.000Z', country: 'NG',
    sampleLink: 'http://localhost:3101/o/preview',
  }
  const draw = (patch: Partial<FormValues>, offer: PreviewCampaign = mine, marked: Marked = null) =>
    renderToStaticMarkup(
      <PlacementFields
        values={values(patch)}
        cpmCents={{ card: 100, featured: 200, video: 300, splash: 400 }}
        choose={vi.fn()}
        status={{ state: 'idle' }}
        pick={vi.fn()}
        remove={vi.fn()}
        mine={{ ...offer, placement: patch.placement ?? 'card' }}
        loadLive={async () => []}
        marked={marked}
      />,
    )
  const accept = (m: string) => attr(/<input [^>]*type="file"[^>]*>/.exec(m)?.[0], 'accept')

  it('names each placement tile by its placement first, the inventory badge after', () => {
    const tiles = buttons(draw({ placement: 'card' })).slice(0, 4)
    ;['Wall card', 'Featured tile', 'Video', 'Splash'].forEach((name, i) => expect(tiles[i].startsWith(name)).toBe(true))
    expect(tiles[2]).toMatch(/^Videoinventory TBC/)
    expect(tiles[3]).toMatch(/^Splashinventory TBC/)
  })

  it('a Wall card or Featured tile takes a JPG, PNG or WebP and shows it as it is', () => {
    for (const placement of ['card', 'featured'] as const) {
      const m = draw({ placement, creative: { key: 'k.png', kind: 'image', url: '/uploads/k.png' } })
      expect(accept(m)).toBe('image/jpeg,image/png,image/webp')
      expect(images(m)).toEqual([{ src: '/uploads/k.png', alt: 'The image you chose' }])
      expect(buttons(m)).not.toContain('View full size')
    }
  })

  it('Video takes an MP4 and plays it with controls', () => {
    const m = draw({ placement: 'video', creative: { key: 'k.mp4', kind: 'video', url: '/uploads/k.mp4' } })
    expect(accept(m)).toBe('video/mp4')
    expect(attr(videos(m)[0], 'src')).toBe('/uploads/k.mp4#t=0.1')
    expect(videos(m)[0]).toContain('controls=""')
    expect(text(m)).toContain('— MP4, 6–15 s, under 25 MB. Required.')
    expect(text(draw({ placement: 'video', creative: null }))).toContain('Upload creativedrag an MP4 here, or choose a file')
  })

  it('Splash takes an image or an MP4 and shows it full screen in a small phone, with View full size', () => {
    const m = draw({ placement: 'splash', creative: { key: 's.png', kind: 'image', url: '/uploads/s.png' } })
    expect(accept(m)).toBe('image/jpeg,image/png,image/webp,video/mp4')
    const thumb = /<div class="phone-thumb"[^>]*>/.exec(m)?.[0]
    expect([attr(thumb, 'role'), attr(thumb, 'aria-label')]).toEqual(['img', 'Your splash on a phone'])
    expect(m).toMatch(/class="phone-thumb"[^>]*><div inert="">\s*<div class="phone">/)
    expect(m).toMatch(/class="splash"[^>]*><img src="\/uploads\/s.png"/)
    expect(buttons(m).slice(-3)).toEqual(['Replace', 'Remove', 'View full size'])
    expect(text(m)).toContain('— portrait image under 4 MB, or an MP4 under 25 MB. Required.')
  })

  it('a splash video sits in the phone as a still first frame, without controls at that size', () => {
    const m = draw(
      { placement: 'splash', creative: { key: 's.mp4', kind: 'video', url: '/uploads/s.mp4' } },
      { ...mine, creative: { image: null, video: '/uploads/s.mp4', color: '#FF5A1F' } },
    )
    const [video] = videos(m)
    expect(attr(video, 'src')).toBe('/uploads/s.mp4#t=0.1')
    expect(video).toContain('muted=""')
    expect(video).not.toContain('controls')
  })

  it('with nothing chosen, Splash shows the zone, not the phone, and no demo wording', () => {
    const m = draw({ placement: 'splash', creative: null })
    expect(m).not.toContain('phone-thumb')
    expect(text(m)).toContain('Upload creativedrag an image or an MP4 here, or choose a file')
    expect(text(m)).not.toContain('(demo)')
  })

  it("a refused creative: the zone the refusal focuses is marked and described by the sentence under the picker", () => {
    const refusal = { field: 'creative' as const, message: 'Video and splash need a creative attached.' }
    const m = draw({ placement: 'video', creative: null }, mine, refusal)
    expect([attr(pick(m), 'aria-invalid'), attr(pick(m), 'aria-describedby')]).toEqual(['true', 'cf-err-creative'])
    expect(m).toContain('<span class="hint bad" id="cf-err-creative">Video and splash need a creative attached.</span>')
    // The focus lands inside the creative's group (focusField looks there for the first button).
    expect(m.indexOf('id="cf-field-creative"')).toBeLessThan(m.indexOf('class="pick"'))
    // Another field's refusal leaves the picker alone.
    expect(pick(draw({ placement: 'video', creative: null }, mine, { field: 'budgetUsd', message: 'x' }))).not.toContain('aria-invalid')
  })
})
