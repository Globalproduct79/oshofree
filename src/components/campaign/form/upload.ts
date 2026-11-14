import { CAMPAIGN_FORM_COPY as F } from '@/lib/copy-campaign-form'
import { MAX_IMAGE_BYTES } from '@/lib/image-rules'
import type { Creative } from './values'

// The creative upload (spec §6.3): images and MP4 up to 2 MB through /api/upload, which checks type,
// bytes and size; a video's 6–15 s length is checked here first, from its metadata.

export type Uploaded = { ok: true; creative: Creative } | { ok: false; message: string }

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

export async function uploadCreative(file: File): Promise<Uploaded> {
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, message: F.upload.tooLarge }
  if (file.type.startsWith('video/')) {
    const seconds = await videoSeconds(file)
    if (Number.isNaN(seconds)) return { ok: false, message: F.upload.bad }
    if (seconds < 6 || seconds > 15) return { ok: false, message: F.upload.videoLength }
  }
  try {
    const body = new FormData()
    body.set('file', file)
    const res = await fetch('/api/upload', { method: 'POST', body })
    const json: { key?: unknown; kind?: unknown; url?: unknown } | null = await res.json().catch(() => null)
    if (res.status === 413) return { ok: false, message: F.upload.tooLarge }
    if (res.status === 400) return { ok: false, message: F.upload.bad }
    const { key, kind, url } = json ?? {}
    if (!res.ok || typeof key !== 'string' || typeof url !== 'string' || (kind !== 'image' && kind !== 'video')) {
      return { ok: false, message: F.upload.failed }
    }
    return { ok: true, creative: { key, kind, url } }
  } catch {
    return { ok: false, message: F.upload.failed }
  }
}
