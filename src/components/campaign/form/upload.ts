import type { PickerStatus } from '@/components/og'
import { CAMPAIGN_FORM_COPY as F } from '@/lib/copy-campaign-form'
import type { PlacementKey } from '@/lib/copy-components'
import { capFor, IMAGE_TYPES, VIDEO_TYPES } from '@/lib/image-rules'
import { fits, type Creative, type FormValues } from './values'

// The creative upload (spec §6.3): the picker refuses in the browser what the placement can't take (type) or its
// kind can't hold (size: an image 2 MB, a splash image 4 MB, an MP4 25 MB) and a video outside 6–15 s; then the
// file goes to /api/upload, which checks type, bytes and size again, with its progress reported as it goes.

const U = F.upload
const MB = 1_048_576

export type Uploaded = { ok: true; creative: Creative } | { ok: false; message: string; retry: boolean }

const isImage = (type: string) => (IMAGE_TYPES as readonly string[]).includes(type)
const isVideo = (type: string) => (VIDEO_TYPES as readonly string[]).includes(type)

// A cap reads "2 MB"; a file's size is rounded up to a tenth, so one byte over 2 MB reads 2.1 MB, never 2 MB.
const limitText = (bytes: number) => `${bytes / MB} MB`
const sizeText = (bytes: number) => `${Math.ceil((bytes * 10) / MB) / 10} MB`

// The extensions each placement takes: a file named like one but refused by its type is not called by its name
// ("That file is a WEBP. Use a JPG, PNG or WebP." would contradict itself).
const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp']
const TAKES_EXT: Record<PlacementKey, readonly string[]> = {
  card: IMAGE_EXT, featured: IMAGE_EXT, video: ['mp4'], splash: [...IMAGE_EXT, 'mp4'],
}

// "a GIF", "an MP4", "an SVG": the file's extension (else its declared type) as a reader says it. Letters read
// one by one (a digit, or no vowel) take "an" before A, E, F, H, I, L, M, N, O, R, S and X; a word before a vowel.
// Null when it has no name to give, or the name is one the placement takes.
function typeName(file: { name: string; type: string }, placement: PlacementKey): string | null {
  const ext = /\.([a-z0-9]{1,8})$/i.exec(file.name)?.[1] ?? /^[a-z]+\/(?:x-)?([a-z0-9.-]+)/i.exec(file.type)?.[1]
  if (!ext || TAKES_EXT[placement].includes(ext.toLowerCase())) return null
  const label = ext.toUpperCase()
  const spelt = /\d/.test(label) || !/[AEIOU]/.test(label)
  const an = (spelt ? 'AEFHILMNORSX' : 'AEIOU').includes(label[0])
  return `${an ? 'an' : 'a'} ${label}`
}

// The sentence for a file the placement can't take, or null when it may be sent.
export function checkCreativeFile(file: { name: string; type: string; size: number }, placement: PlacementKey): string | null {
  const image = isImage(file.type)
  const video = isVideo(file.type)
  const takes = placement === 'video' ? video : placement === 'splash' ? image || video : image
  if (!takes) {
    if (placement === 'video') return U.wrongVideo
    const name = typeName(file, placement)
    if (!name) return U.bad
    return placement === 'splash' ? U.wrongSplash(name) : U.wrongImage(name)
  }
  if (file.size === 0) return U.bad
  const cap = capFor(video ? 'video' : 'image', placement)
  return file.size > cap ? U.tooLarge(sizeText(file.size), limitText(cap)) : null
}

// Whole seconds as a player shows them, so a "15 s" export of 15.03 s passes. NaN when unreadable.
function videoSeconds(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    const done = (s: number) => {
      URL.revokeObjectURL(url)
      resolve(s)
    }
    video.preload = 'metadata'
    video.onloadedmetadata = () => done(Math.round(video.duration))
    video.onerror = () => done(Number.NaN)
    video.src = url
  })
}

// XMLHttpRequest, not fetch: only it reports how much of the body has gone. Null when the connection failed.
function send(file: File, placement: PlacementKey, onProgress?: (percent: number) => void) {
  return new Promise<{ status: number; body: unknown } | null>((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/upload')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress?.(Math.min(100, Math.floor((e.loaded / e.total) * 100)))
    }
    xhr.onload = () => {
      let body: unknown = null
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        // Not JSON: judged as a failed upload below.
      }
      resolve({ status: xhr.status, body })
    }
    xhr.onerror = xhr.onabort = xhr.ontimeout = () => resolve(null)
    const body = new FormData()
    // Only picks between the image caps on the server (a splash image may be larger).
    body.set('placement', placement)
    body.set('file', file)
    xhr.send(body)
  })
}

export async function uploadCreative(file: File, placement: PlacementKey, onProgress?: (percent: number) => void): Promise<Uploaded> {
  const refused = checkCreativeFile(file, placement)
  if (refused) return { ok: false, message: refused, retry: false }
  if (isVideo(file.type)) {
    const seconds = await videoSeconds(file)
    if (Number.isNaN(seconds)) return { ok: false, message: U.bad, retry: false }
    if (seconds < 6 || seconds > 15) return { ok: false, message: U.videoLength, retry: false }
  }
  const failed = { ok: false, message: U.failed, retry: true } as const
  const res = await send(file, placement, onProgress)
  if (!res) return failed
  if (res.status === 413) return { ok: false, message: U.overLimit(limitText(capFor(isVideo(file.type) ? 'video' : 'image', placement))), retry: false }
  if (res.status === 400) return { ok: false, message: U.bad, retry: false }
  const { key, kind, url } = (res.body ?? {}) as { key?: unknown; kind?: unknown; url?: unknown }
  if (res.status < 200 || res.status > 299 || typeof key !== 'string' || typeof url !== 'string' || (kind !== 'image' && kind !== 'video')) {
    return failed
  }
  return { ok: true, creative: { key, kind, url, bytes: file.size } }
}

export type PickRun = {
  // The placement now: read when the file is picked, and again when its upload lands.
  placement: () => PlacementKey
  status: (s: PickerStatus) => void
  chosen: (c: Creative) => void
  // A local URL for the file's own preview while it uploads (an object URL in the browser), revoked after.
  local?: (file: File) => { url: string; revoke: () => void }
  // An uploaded file the placement could no longer take when it landed: never chosen, so the form can let it go.
  unused?: (c: Creative) => void
  // Why a placement switch took the creative off while this file uploaded (switchPlacement's `gone`), read when the
  // upload fails: the zone is empty then, and the failure alone would not say where the old creative went.
  dropped?: () => string | null
}

// One pick, through the picker's states: refused at once, or uploading (with the file's own preview and the
// percentage) and then chosen, or refused by the server (Retry when trying again could work). A placement that
// changed meanwhile to one that can't take the creative drops it (the server's rule says the same at submit).
export async function pickCreative(file: File, run: PickRun): Promise<void> {
  const placement = run.placement()
  const refused = checkCreativeFile(file, placement)
  if (refused) return run.status({ state: 'error', message: refused, retry: false })
  const local = run.local?.(file)
  const preview = local && ({ url: local.url, kind: isVideo(file.type) ? 'video' : 'image' } as const)
  run.status({ state: 'uploading', percent: 0, preview })
  let res: Uploaded
  try {
    res = await uploadCreative(file, placement, (percent) => run.status({ state: 'uploading', percent, preview }))
  } finally {
    local?.revoke()
  }
  const said = (message: string) => [message, run.dropped?.()].filter(Boolean).join(' ')
  if (!res.ok) return run.status({ state: 'error', message: said(res.message), retry: res.retry })
  if (!fits(run.placement(), res.creative)) {
    run.unused?.(res.creative)
    return run.status({ state: 'error', message: said(F.validation.creativeMismatch), retry: false })
  }
  run.chosen(res.creative)
  run.status({ state: 'idle', note: U.attached[res.creative.kind] })
}

// Why switching to `placement` took the creative off: the wrong kind, or an image over the placement's cap.
export function clearedNote(c: Creative, placement: PlacementKey): string {
  const name = F.placements[placement].name
  if (c.kind === 'video') return U.cleared.video(name)
  if (placement === 'video') return U.cleared.image
  return U.cleared.tooLarge(name, limitText(capFor('image', placement)))
}

// A placement tile pressed. Null for the placement already chosen: nothing changes, so a refusal on the picker stays.
// Otherwise the new placement, without a creative it cannot take, and why that creative went (null when it stayed).
export function switchPlacement(v: FormValues, placement: PlacementKey): { values: FormValues; gone: string | null } | null {
  if (placement === v.placement) return null
  const keeps = fits(placement, v.creative)
  return {
    values: { ...v, placement, creative: keeps ? v.creative : null },
    gone: keeps || !v.creative ? null : clearedNote(v.creative, placement),
  }
}

// Asks the server to delete a file this form uploaded and let go of. Nothing to wait for: if it fails, the file stays.
function deleteUpload(key: string): void {
  void fetch(`/api/upload/${encodeURIComponent(key)}`, { method: 'DELETE' }).catch(() => undefined)
}

// The files this form uploaded since it opened. Only these are deleted once the form lets go of them (Replace,
// Remove, a placement switch, Start over, a file that landed on a placement that no longer takes it): a creative the
// form opened with (Edit offer's, a restored draft's) may be in use elsewhere, and is never. A file let go of is
// deleted on `flush`, which the form calls once its draft no longer names it, so a draft never names a deleted file.
export class SessionUploads {
  private readonly held = new Set<string>()
  private readonly released = new Set<string>()
  constructor(private readonly send: (key: string) => void = deleteUpload) {}

  add(c: Creative): void {
    this.held.add(c.key)
  }

  // The form no longer holds `c` (`now` is the creative it holds instead, if any).
  letGo(c: Creative | null | undefined, now: Creative | null = null): void {
    if (!c || c.key === now?.key || !this.held.delete(c.key)) return
    this.released.add(c.key)
  }

  // A file uploaded here that the form never held (it landed on a placement that no longer takes it): nothing names
  // it, so it is deleted at once.
  drop(c: Creative): void {
    this.send(c.key)
  }

  flush(): void {
    for (const key of this.released) this.send(key)
    this.released.clear()
  }
}
