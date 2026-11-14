import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { VIDEO_KEY_RE } from '@/lib/image-rules'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { creativeUrl, imageUrl, putCreative, putImage } from '@/lib/storage'

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function png(bytes: number) {
  const buf = new Uint8Array(bytes)
  buf.set(PNG_SIGNATURE)
  return buf
}

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'oshofree-uploads-'))
  process.env.UPLOAD_DIR = dir
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('putImage', () => {
  it('rejects a 3 MB image', async () => {
    const file = new File([png(3 * 1024 * 1024)], 'big.png', { type: 'image/png' })
    await expect(putImage(file)).rejects.toBe('BAD_IMAGE')
  })

  it('rejects a .gif', async () => {
    const gif = new TextEncoder().encode('GIF89a'.padEnd(1024, '\0'))
    const file = new File([gif], 'anim.gif', { type: 'image/gif' })
    await expect(putImage(file)).rejects.toBe('BAD_IMAGE')
  })

  it('accepts a 10 KB png and stores it under a <uuid>.png key', async () => {
    const bytes = png(10 * 1024)
    const key = await putImage(new File([bytes], 'card.png', { type: 'image/png' }))
    expect(key).toMatch(/^[0-9a-f-]{36}\.png$/)
    expect(new Uint8Array(await readFile(path.join(dir, key)))).toEqual(bytes)
    expect(imageUrl(key)).toBe(`/uploads/${key}`)
  })
})

function mp4(bytes: number) {
  const buf = new Uint8Array(bytes)
  buf.set([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]) // size, 'ftyp'
  return buf
}

describe('putCreative', () => {
  it('stores an MP4 of 2 MB as a video with an .mp4 key', async () => {
    const out = await putCreative(new File([mp4(2_097_152)], 'v.mp4', { type: 'video/mp4' }))
    expect(out.kind).toBe('video')
    expect(out.key).toMatch(VIDEO_KEY_RE)
    expect(creativeUrl(out.key)).toBe(imageUrl(out.key))
  })

  it('stores a png as an image', async () => {
    const out = await putCreative(new File([png(1024)], 'c.png', { type: 'image/png' }))
    expect(out.kind).toBe('image')
  })

  it('refuses one byte over 2 MB as too_large', async () => {
    await expect(putCreative(new File([mp4(2_097_153)], 'v.mp4', { type: 'video/mp4' }))).rejects.toBe('too_large')
  })

  it('refuses a .mov and a gif as unsupported_type', async () => {
    await expect(putCreative(new File([mp4(1024)], 'v.mov', { type: 'video/quicktime' }))).rejects.toBe('unsupported_type')
    await expect(putCreative(new File([new Uint8Array(1024)], 'a.gif', { type: 'image/gif' }))).rejects.toBe('unsupported_type')
  })

  it('refuses bytes that are not an MP4 despite the declared type', async () => {
    await expect(putCreative(new File([new Uint8Array(1024)], 'v.mp4', { type: 'video/mp4' }))).rejects.toBe('unsupported_type')
  })

  it('putImage still refuses a video', async () => {
    await expect(putImage(new File([mp4(1024)], 'v.mp4', { type: 'video/mp4' }))).rejects.toBe('BAD_IMAGE')
  })
})
