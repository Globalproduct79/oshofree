import 'server-only'
import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { CREATIVE_KEY_RE, MAX_IMAGE_BYTES } from '@/lib/image-rules'
import { uploadDir } from '@/lib/upload-dir'

// Local disk in slice 1; an S3-compatible bucket replaces the body of these three functions later.

const TYPES = {
  'image/jpeg': { ext: 'jpg', magic: (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: 'png', magic: (b: Uint8Array) => b[0] === 0x89 && ascii(b, 1, 4) === 'PNG' },
  'image/webp': { ext: 'webp', magic: (b: Uint8Array) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP' },
  'video/mp4': { ext: 'mp4', magic: (b: Uint8Array) => ascii(b, 4, 8) === 'ftyp' },
} as const

const CONTENT_TYPE: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', mp4: 'video/mp4' }

function ascii(b: Uint8Array, from: number, to: number) {
  return String.fromCharCode(...b.subarray(from, to))
}


export type CreativeError = 'too_large' | 'unsupported_type'

// Images and MP4 video, each up to 2 MB. The declared type must be one we accept AND the bytes must agree.
// The 6-15 s video duration is checked in the browser (a <video> element's duration) by the campaign form;
// the server checks type and size only.
export async function putCreative(file: File): Promise<{ key: string; kind: 'image' | 'video' }> {
  const type = TYPES[file.type as keyof typeof TYPES]
  if (!type || file.size === 0) throw 'unsupported_type' satisfies CreativeError
  if (file.size > MAX_IMAGE_BYTES) throw 'too_large' satisfies CreativeError
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!type.magic(bytes)) throw 'unsupported_type' satisfies CreativeError
  const key = `${randomUUID()}.${type.ext}`
  await mkdir(uploadDir(), { recursive: true })
  await writeFile(path.join(uploadDir(), key), bytes)
  return { key, kind: type.ext === 'mp4' ? 'video' : 'image' }
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
