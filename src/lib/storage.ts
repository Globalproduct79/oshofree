import 'server-only'
import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { capFor, CREATIVE_KEY_RE, UPLOAD_CAP, uploadKind } from '@/lib/image-rules'
import { uploadDir } from '@/lib/upload-dir'

// Local disk in slice 1; an S3-compatible bucket replaces the body of these functions later.

const MP4_BRANDS = ['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'dash']

const TYPES = {
  'image/jpeg': { ext: 'jpg', magic: (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: 'png', magic: (b: Uint8Array) => b[0] === 0x89 && ascii(b, 1, 4) === 'PNG' },
  'image/webp': { ext: 'webp', magic: (b: Uint8Array) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP' },
  // An ISO media file starts with an `ftyp` box whose major brand (bytes 8-12) names the format. HEIC and AVIF
  // images share the box, so the brand must be an MP4 one.
  'video/mp4': { ext: 'mp4', magic: (b: Uint8Array) => ascii(b, 4, 8) === 'ftyp' && MP4_BRANDS.includes(ascii(b, 8, 12)) },
} as const

const CONTENT_TYPE: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', mp4: 'video/mp4' }

function ascii(b: Uint8Array, from: number, to: number) {
  return String.fromCharCode(...b.subarray(from, to))
}


export type CreativeError = 'too_large' | 'unsupported_type'

// Images and MP4 video, each capped by its kind (image-rules: an image 2 MB, a splash image 4 MB, an MP4 25 MB).
// The declared type must be one we accept AND the bytes must agree. The placement the caller names only tells a
// splash image from a card one. The 6-15 s video duration is checked in the browser (a <video> element's
// duration) by the campaign form; the server checks type and size only.
export async function putCreative(file: File, opts: { placement?: unknown } = {}): Promise<{ key: string; kind: 'image' | 'video' }> {
  const type = TYPES[file.type as keyof typeof TYPES]
  if (!type || file.size === 0) throw 'unsupported_type' satisfies CreativeError
  if (file.size > UPLOAD_CAP[uploadKind(file.type, opts.placement)]) throw 'too_large' satisfies CreativeError
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!type.magic(bytes)) throw 'unsupported_type' satisfies CreativeError
  const key = `${randomUUID()}.${type.ext}`
  await mkdir(uploadDir(), { recursive: true })
  await writeFile(path.join(uploadDir(), key), bytes)
  return { key, kind: type.ext === 'mp4' ? 'video' : 'image' }
}

// The submit-time backstop for the file itself: true when the creative named is not stored (a key crafted past the
// form, or a draft still naming a file the form has since let go of and deleted). No creative, nothing missing.
export async function creativeMissing(i: { creativeImageKey?: string | null; creativeVideoKey?: string | null }): Promise<boolean> {
  const key = i.creativeVideoKey ?? i.creativeImageKey
  if (!key) return false
  if (!CREATIVE_KEY_RE.test(key)) return true
  const info = await stat(path.join(uploadDir(), key)).catch(() => null)
  return !info?.isFile()
}

// The submit-time backstop for the caps by kind: true when the stored creative is larger than its placement takes
// (a 3 MB image uploaded for a splash, then sent on a card past the form). One stat; a key with no file on disk is
// left to the other rules.
export async function creativeOverCap(i: {
  placement: string
  creativeImageKey?: string | null
  creativeVideoKey?: string | null
}): Promise<boolean> {
  const key = i.creativeVideoKey ?? i.creativeImageKey
  if (!key || !CREATIVE_KEY_RE.test(key)) return false
  const info = await stat(path.join(uploadDir(), key)).catch(() => null)
  if (!info?.isFile()) return false
  return info.size > capFor(i.creativeVideoKey ? 'video' : 'image', i.placement)
}

// Deletes a stored creative (one the form let go of: creative-uploads.ts decides which). A key that is not ours, or a
// file already gone, is left alone.
export async function deleteCreative(key: string): Promise<void> {
  if (!CREATIVE_KEY_RE.test(key)) return
  await rm(path.join(uploadDir(), key), { force: true })
}

// Slice-1 callers: images only, one error code.
export async function putImage(file: File): Promise<string> {
  if (file.type.startsWith('video/')) throw 'BAD_IMAGE'
  try {
    return (await putCreative(file)).key
  } catch (e) {
    if (e === 'too_large' || e === 'unsupported_type') throw 'BAD_IMAGE'
    throw e
  }
}

// The URL helpers are pure (image-rules.ts), so modules the seed loads under tsx can build URLs too.
export { creativeUrl, imageUrl } from '@/lib/image-rules'

// Null for a key that is not ours to serve (bad shape, path tricks) or a missing file.
export async function openImage(key: string, range?: { start: number; end: number }) {
  const match = CREATIVE_KEY_RE.exec(key)
  if (!match) return null
  const file = path.join(uploadDir(), key)
  const info = await stat(file).catch(() => null)
  if (!info?.isFile()) return null
  return {
    body: Readable.toWeb(createReadStream(file, range)) as ReadableStream<Uint8Array>,
    contentType: CONTENT_TYPE[match[1]],
    size: info.size,
  }
}
