import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkCreativeFile, clearedNote, pickCreative, SessionUploads, switchPlacement, uploadCreative,
} from '@/components/campaign/form/upload'
import { newCampaignDefaults, type FormValues } from '@/components/campaign/form/values'
import { CreativePicker, type PickerStatus } from '@/components/og'
import { MAX_IMAGE_BYTES, MAX_SPLASH_BYTES, MAX_VIDEO_BYTES } from '@/lib/image-rules'

// The creative's trip from the picker to /api/upload, with XMLHttpRequest faked: the browser's upload progress
// arrives as events, the server's answer as a status and a body.

class FakeXHR {
  static sent: FakeXHR[] = []
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null
  ontimeout: (() => void) | null = null
  status = 0
  responseText = ''
  method = ''
  url = ''
  body: FormData | null = null
  open(method: string, url: string) {
    this.method = method
    this.url = url
  }
  send(body: FormData) {
    this.body = body
    FakeXHR.sent.push(this)
  }
  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total })
  }
  respond(status: number, body: unknown) {
    this.status = status
    this.responseText = typeof body === 'string' ? body : JSON.stringify(body)
    this.onload?.()
  }
}

// The one request the code under test has sent, once it has.
async function request(): Promise<FakeXHR> {
  await vi.waitFor(() => expect(FakeXHR.sent).toHaveLength(1))
  return FakeXHR.sent[0]
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const file = (name: string, type: string, size = 1024) => {
  const bytes = new Uint8Array(size)
  bytes.set(PNG.slice(0, Math.min(size, PNG.length)))
  return new File([bytes], name, { type })
}
const png = (size = 1024) => file('card.png', 'image/png', size)
const KEY = '0f8fad5b-d9cb-469f-a165-70867728950e.png'
const stored = { key: KEY, kind: 'image', url: `/uploads/${KEY}` }

// A <video> that reports `seconds` once its metadata loads (what the form reads a clip's length from).
function videoLasting(seconds: number) {
  vi.stubGlobal('document', {
    createElement: () => {
      const v: Record<string, unknown> = { duration: seconds }
      return new Proxy(v, {
        set(target, prop, value) {
          target[prop as string] = value
          if (prop === 'src') queueMicrotask(() => (target.onloadedmetadata as () => void)())
          return true
        },
      })
    },
  })
}

beforeEach(() => {
  FakeXHR.sent = []
  vi.stubGlobal('XMLHttpRequest', FakeXHR)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('checkCreativeFile: refused in the browser before anything is sent', () => {
  it('names a type the placement cannot take, in its words', () => {
    expect(checkCreativeFile(file('anim.gif', 'image/gif'), 'card')).toBe('That file is a GIF. Use a JPG, PNG or WebP.')
    expect(checkCreativeFile(file('photo.avif', 'image/avif'), 'featured')).toBe('That file is an AVIF. Use a JPG, PNG or WebP.')
    expect(checkCreativeFile(file('clip.mp4', 'video/mp4'), 'card')).toBe('That file is an MP4. Use a JPG, PNG or WebP.')
    expect(checkCreativeFile(file('logo.svg', 'image/svg+xml'), 'card')).toBe('That file is an SVG. Use a JPG, PNG or WebP.')
    expect(checkCreativeFile(file('clip.mov', 'video/quicktime'), 'video')).toBe('MP4 only for video.')
    expect(checkCreativeFile(png(), 'video')).toBe('MP4 only for video.')
    expect(checkCreativeFile(file('anim.gif', 'image/gif'), 'splash')).toBe(
      'That file is a GIF. Use a JPG, PNG or WebP image, or an MP4 video.',
    )
    // A name the placement takes on a file whose type it refuses is not repeated back: the general sentence.
    const general = "That file can't be used. Attach a JPG, PNG or WebP image, or an MP4 video."
    expect(checkCreativeFile(file('photo.webp', ''), 'card')).toBe(general)
    expect(checkCreativeFile(file('photo.JPG', 'image/heic'), 'featured')).toBe(general)
    expect(checkCreativeFile(file('clip.mp4', 'video/quicktime'), 'splash')).toBe(general)
    // No extension: the declared type names it; neither: the general sentence.
    expect(checkCreativeFile(file('scan', 'application/pdf'), 'card')).toBe('That file is a PDF. Use a JPG, PNG or WebP.')
    expect(checkCreativeFile(file('mystery', ''), 'card')).toBe(
      "That file can't be used. Attach a JPG, PNG or WebP image, or an MP4 video.",
    )
  })

  it('names the size and the cap for the kind: 2 MB a card image, 4 MB a splash image, 25 MB an MP4', () => {
    expect(checkCreativeFile(png(MAX_IMAGE_BYTES), 'card')).toBeNull()
    expect(checkCreativeFile(png(MAX_IMAGE_BYTES + 1), 'card')).toBe('That file is 2.1 MB; the limit is 2 MB.')
    expect(checkCreativeFile(png(3 * 1024 * 1024), 'featured')).toBe('That file is 3 MB; the limit is 2 MB.')
    expect(checkCreativeFile(png(3 * 1024 * 1024), 'splash')).toBeNull()
    expect(checkCreativeFile(png(MAX_SPLASH_BYTES + 1), 'splash')).toBe('That file is 4.1 MB; the limit is 4 MB.')
    const mp4 = (size: number) => ({ name: 'clip.mp4', type: 'video/mp4', size })
    expect(checkCreativeFile(mp4(MAX_VIDEO_BYTES), 'video')).toBeNull()
    expect(checkCreativeFile(mp4(MAX_VIDEO_BYTES), 'splash')).toBeNull()
    expect(checkCreativeFile(mp4(MAX_VIDEO_BYTES + 1), 'video')).toBe('That file is 25.1 MB; the limit is 25 MB.')
  })
})

describe('uploadCreative', () => {
  it('posts the placement and the file, reports progress, and answers the stored creative with its size', async () => {
    const progress: number[] = []
    const done = uploadCreative(png(4096), 'splash', (p) => progress.push(p))
    const xhr = await request()
    expect([xhr.method, xhr.url]).toEqual(['POST', '/api/upload'])
    expect(xhr.body?.get('placement')).toBe('splash')
    expect((xhr.body?.get('file') as File).name).toBe('card.png')
    xhr.progress(1024, 4096)
    xhr.progress(4096, 4096)
    xhr.respond(200, stored)
    expect(await done).toEqual({ ok: true, creative: { ...stored, bytes: 4096 } })
    expect(progress).toEqual([25, 100])
  })

  it('a file refused in the browser never opens a request', async () => {
    expect(await uploadCreative(file('anim.gif', 'image/gif'), 'card')).toEqual({
      ok: false, message: 'That file is a GIF. Use a JPG, PNG or WebP.', retry: false,
    })
    expect(FakeXHR.sent).toHaveLength(0)
  })

  it("says what the server refused, offering Retry only when trying again could work", async () => {
    const answer = async (status: number, body: unknown) => {
      FakeXHR.sent = []
      const done = uploadCreative(png(4096), 'card')
      ;(await request()).respond(status, body)
      return done
    }
    expect(await answer(413, { error: 'too_large' })).toEqual({ ok: false, message: 'That file is over the 2 MB limit.', retry: false })
    expect(await answer(400, { error: 'BAD_IMAGE' })).toEqual({
      ok: false, message: "That file can't be used. Attach a JPG, PNG or WebP image, or an MP4 video.", retry: false,
    })
    const failed = { ok: false, message: "The upload didn't finish. Try again.", retry: true }
    expect(await answer(500, 'Internal Server Error')).toEqual(failed)
    expect(await answer(200, '<html>')).toEqual(failed)
    expect(await answer(200, { key: KEY, kind: 'gif', url: '/x' })).toEqual(failed)
  })

  it('a dropped connection can be retried', async () => {
    const done = uploadCreative(png(), 'card')
    ;(await request()).onerror?.()
    expect(await done).toEqual({ ok: false, message: "The upload didn't finish. Try again.", retry: true })
  })

  it("reads a video's length before sending it: 6–15 s", async () => {
    videoLasting(20)
    const long = await uploadCreative(file('clip.mp4', 'video/mp4'), 'video')
    expect(long).toEqual({ ok: false, message: 'Video must be 6–15 seconds.', retry: false })
    expect(FakeXHR.sent).toHaveLength(0)
    videoLasting(10)
    const done = uploadCreative(file('clip.mp4', 'video/mp4'), 'video')
    const key = KEY.replace('.png', '.mp4')
    ;(await request()).respond(200, { key, kind: 'video', url: `/uploads/${key}` })
    expect(await done).toMatchObject({ ok: true, creative: { kind: 'video', key } })
  })
})

describe('pickCreative: the picker states one pick goes through', () => {
  const html = (status: PickerStatus, chosen: { url: string; kind: 'image' | 'video' } | null = null) =>
    renderToStaticMarkup(
      createElement(CreativePicker, {
        label: 'Ad image', hint: '', zoneTitle: 'Upload image', zoneHint: 'drag it here', status, chosen,
        onPick: vi.fn(), onRemove: vi.fn(),
      }),
    )

  function run(f: File, placement: () => 'card' | 'video' | 'splash' = () => 'card', dropped?: () => string | null) {
    const statuses: PickerStatus[] = []
    const chosen: unknown[] = []
    const revoke = vi.fn()
    const unused: unknown[] = []
    const done = pickCreative(f, {
      placement,
      status: (s) => statuses.push(s),
      chosen: (c) => chosen.push(c),
      unused: (c) => unused.push(c),
      local: () => ({ url: 'blob:local', revoke }),
      dropped,
    })
    return { statuses, chosen, unused, revoke, done }
  }

  it('uploading with the local preview and progress, then the stored creative is chosen and the picker rests', async () => {
    const r = run(png(2048))
    const xhr = await request()
    xhr.progress(512, 2048)
    xhr.respond(200, stored)
    await r.done
    expect(r.statuses).toEqual([
      { state: 'uploading', percent: 0, preview: { url: 'blob:local', kind: 'image' } },
      { state: 'uploading', percent: 25, preview: { url: 'blob:local', kind: 'image' } },
      { state: 'idle', note: 'Image attached.' },
    ])
    expect(r.chosen).toEqual([{ ...stored, bytes: 2048 }])
    expect(r.revoke).toHaveBeenCalledOnce()
    const uploading = html(r.statuses[1])
    expect(uploading).toContain('<img src="blob:local"')
    expect(uploading).toMatch(/role="progressbar"[^>]*aria-valuenow="25"/)
    expect(uploading).toContain('<span aria-live="polite">Uploading…</span><span aria-hidden="true">25%</span>')
    // The outcome, said once.
    expect(html(r.statuses[2], { url: stored.url, kind: 'image' })).toContain('<span aria-live="polite">Image attached.</span>')
  })

  it('a refused file: one error, no request, no Retry', async () => {
    const r = run(file('anim.gif', 'image/gif'))
    await r.done
    expect(r.statuses).toEqual([{ state: 'error', message: 'That file is a GIF. Use a JPG, PNG or WebP.', retry: false }])
    expect(FakeXHR.sent).toHaveLength(0)
    expect(html(r.statuses[0])).not.toContain('>Retry<')
  })

  it('a failed upload: the message with Retry, and nothing chosen', async () => {
    const r = run(png())
    ;(await request()).respond(503, '')
    await r.done
    expect(r.statuses.at(-1)).toEqual({ state: 'error', message: "The upload didn't finish. Try again.", retry: true })
    expect(r.chosen).toEqual([])
    expect(r.revoke).toHaveBeenCalledOnce()
    expect(html(r.statuses.at(-1)!)).toContain('>Retry</button>')
  })

  it('the placement changed while it uploaded to one that cannot take it: dropped, with the mismatch sentence', async () => {
    let placement: 'card' | 'video' = 'card'
    const r = run(png(), () => placement)
    const xhr = await request()
    placement = 'video'
    xhr.respond(200, stored)
    await r.done
    expect(r.chosen).toEqual([])
    expect(r.statuses.at(-1)).toEqual({ state: 'error', message: "The creative doesn't match the placement.", retry: false })
    // Stored but never chosen: handed back so the form can have it deleted.
    expect(r.unused).toEqual([{ ...stored, bytes: 1024 }])
  })

  describe('a placement switch while a file uploads', () => {
    const GONE = 'The image was removed — Video needs an MP4.'
    it('a failed upload also says what the switch took off, since the zone is empty after it', async () => {
      const r = run(png(), () => 'card', () => GONE)
      ;(await request()).respond(503, '')
      await r.done
      expect(r.statuses.at(-1)).toEqual({ state: 'error', message: `The upload didn't finish. Try again. ${GONE}`, retry: true })
    })

    it('an upload that lands replaces the old creative anyway: only its own outcome is said', async () => {
      const r = run(png(), () => 'card', () => GONE)
      ;(await request()).respond(200, stored)
      await r.done
      expect(r.statuses.at(-1)).toEqual({ state: 'idle', note: 'Image attached.' })
    })

    it('nothing taken off, nothing added', async () => {
      const r = run(png(), () => 'card', () => null)
      ;(await request()).respond(503, '')
      await r.done
      expect(r.statuses.at(-1)).toEqual({ state: 'error', message: "The upload didn't finish. Try again.", retry: true })
    })
  })
})

describe('SessionUploads: the files the form uploaded, deleted once it lets go of them', () => {
  const c = (key: string) => ({ key, kind: 'image' as const, url: `/uploads/${key}` })
  const setup = () => {
    const sent: string[] = []
    return { sent, uploads: new SessionUploads((key) => sent.push(key)) }
  }

  it('a replaced or removed upload is deleted on the next flush (once the draft no longer names it), and only once', () => {
    const { sent, uploads } = setup()
    uploads.add(c('a.png'))
    uploads.add(c('b.png'))
    uploads.letGo(c('a.png'), c('b.png'))
    expect(sent).toEqual([])
    uploads.flush()
    expect(sent).toEqual(['a.png'])
    uploads.letGo(c('b.png'))
    uploads.letGo(c('b.png'))
    uploads.flush()
    uploads.flush()
    expect(sent).toEqual(['a.png', 'b.png'])
  })

  it("never deletes a creative the form opened with (Edit offer's, a restored draft's), or the one it still holds", () => {
    const { sent, uploads } = setup()
    uploads.letGo(c('campaign.png'), c('new.png'))
    uploads.add(c('new.png'))
    uploads.letGo(c('new.png'), c('new.png'))
    uploads.letGo(null)
    uploads.flush()
    expect(sent).toEqual([])
  })

  it('a file the form never held goes at once', () => {
    const { sent, uploads } = setup()
    uploads.drop(c('landed-late.png'))
    expect(sent).toEqual(['landed-late.png'])
  })
})

describe('switchPlacement: a placement tile pressed', () => {
  const MB = 1024 * 1024
  const form = (patch: Partial<FormValues>): FormValues => ({
    ...newCampaignDefaults({ name: 'Kola Bright', type: 'Brand', country: 'NG' }),
    ...patch,
  })
  const image = { key: 'k.png', kind: 'image' as const, url: '/uploads/k.png', bytes: 1024 }
  const video = { key: 'k.mp4', kind: 'video' as const, url: '/uploads/k.mp4', bytes: 1024 }

  it('the placement already chosen changes nothing, so a refusal on the picker stays', () => {
    expect(switchPlacement(form({ placement: 'card', creative: image }), 'card')).toBeNull()
    expect(switchPlacement(form({ placement: 'video', creative: null }), 'video')).toBeNull()
  })

  it('keeps a creative the new placement takes, and says nothing', () => {
    expect(switchPlacement(form({ placement: 'card', creative: image }), 'featured')).toEqual({
      values: form({ placement: 'featured', creative: image }), gone: null,
    })
    expect(switchPlacement(form({ placement: 'video', creative: video }), 'splash')?.gone).toBeNull()
    expect(switchPlacement(form({ placement: 'card', creative: null }), 'video')?.gone).toBeNull()
  })

  it('takes off a creative it cannot take, and says why', () => {
    expect(switchPlacement(form({ placement: 'card', creative: image }), 'video')).toEqual({
      values: form({ placement: 'video', creative: null }), gone: 'The image was removed — Video needs an MP4.',
    })
    expect(switchPlacement(form({ placement: 'video', creative: video }), 'card')?.gone).toBe('The video was removed — a Wall card shows an image.')
    const big = { ...image, bytes: 3 * MB }
    expect(switchPlacement(form({ placement: 'splash', creative: big }), 'card')?.gone).toBe(
      'The image was removed — a Wall card takes images up to 2 MB.',
    )
  })
})

describe('clearedNote: why a placement switch took the creative off', () => {
  const MB = 1024 * 1024
  it('names what went and what the placement takes', () => {
    expect(clearedNote({ key: 'k.mp4', kind: 'video', url: '/u' }, 'card')).toBe('The video was removed — a Wall card shows an image.')
    expect(clearedNote({ key: 'k.mp4', kind: 'video', url: '/u' }, 'featured')).toBe(
      'The video was removed — a Featured tile shows an image.',
    )
    expect(clearedNote({ key: 'k.png', kind: 'image', url: '/u' }, 'video')).toBe('The image was removed — Video needs an MP4.')
    expect(clearedNote({ key: 'k.png', kind: 'image', url: '/u', bytes: 3 * MB }, 'card')).toBe(
      'The image was removed — a Wall card takes images up to 2 MB.',
    )
  })
})
