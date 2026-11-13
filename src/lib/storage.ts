import 'server-only'
import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { acceptableImage, IMAGE_KEY_RE } from '@/lib/image-rules'

// Local disk in slice 1; an S3-compatible bucket replaces the body of these three functions later.

const TYPES = {
  'image/jpeg': { ext: 'jpg', magic: (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: 'png', magic: (b: Uint8Array) => b[0] === 0x89 && ascii(b, 1, 4) === 'PNG' },
  'image/webp': { ext: 'webp', magic: (b: Uint8Array) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP' },
} as const

const CONTENT_TYPE: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

function ascii(b: Uint8Array, from: number, to: number) {
  return String.fromCharCode(...b.subarray(from, to))
}

function uploadDir() {
  return path.resolve(process.env.UPLOAD_DIR || './uploads')
}

// The declared type must be one we accept AND the bytes must agree with it.
export async function putImage(file: File): Promise<string> {
  const type = TYPES[file.type as keyof typeof TYPES]
  if (!type || !acceptableImage(file)) throw 'BAD_IMAGE'
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!type.magic(bytes)) throw 'BAD_IMAGE'
  const key = `${randomUUID()}.${type.ext}`
  await mkdir(uploadDir(), { recursive: true })
  await writeFile(path.join(uploadDir(), key), bytes)
  return key
}

export function imageUrl(key: string): string {
  return `/uploads/${key}`
}

// Null for a key that is not ours to serve (bad shape, path tricks) or a missing file.
export async function openImage(key: string) {
  const match = IMAGE_KEY_RE.exec(key)
  if (!match) return null
  const file = path.join(uploadDir(), key)
  const info = await stat(file).catch(() => null)
  if (!info?.isFile()) return null
  return {
    body: Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>,
    contentType: CONTENT_TYPE[match[1]],
    size: info.size,
  }
}
