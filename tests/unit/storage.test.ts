import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  MAX_IMAGE_BYTES, MAX_SPLASH_BYTES, MAX_UPLOAD_BODY_BYTES, MAX_VIDEO_BYTES, UPLOAD_CAP, uploadKind, VIDEO_KEY_RE,
} from '@/lib/image-rules'
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
  buf.set([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]) // size, 'ftyp'
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

  it('stores an MP4 of 25 MB and refuses one byte more as too_large', async () => {
    const out = await putCreative(new File([mp4(MAX_VIDEO_BYTES)], 'v.mp4', { type: 'video/mp4' }))
    expect(out.kind).toBe('video')
    await expect(putCreative(new File([mp4(MAX_VIDEO_BYTES + 1)], 'v.mp4', { type: 'video/mp4' }))).rejects.toBe('too_large')
  })

  it('refuses a .mov and a gif as unsupported_type', async () => {
    await expect(putCreative(new File([mp4(1024)], 'v.mov', { type: 'video/quicktime' }))).rejects.toBe('unsupported_type')
    await expect(putCreative(new File([new Uint8Array(1024)], 'a.gif', { type: 'image/gif' }))).rejects.toBe('unsupported_type')
  })

  // An ISO media header: the box size, 'ftyp', then the major brand.
  const iso = (brand: string) => {
    const b = new Uint8Array(1024)
    b.set([0, 0, 0, 0x18, ...new TextEncoder().encode(`ftyp${brand}`)])
    return new File([b], 'v.mp4', { type: 'video/mp4' })
  }

  it('takes an MP4 by its major brand: isom, mp42, M4V and dash among them', async () => {
    for (const brand of ['isom', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'dash']) {
      expect((await putCreative(iso(brand))).kind).toBe('video')
    }
  })

  it('refuses a HEIC or AVIF image, or a QuickTime movie, declared as an MP4: same ftyp box, other brand', async () => {
    for (const brand of ['heic', 'mif1', 'avif', 'qt  ', '3gp4', '\0\0\0\0']) {
      await expect(putCreative(iso(brand))).rejects.toBe('unsupported_type')
    }
  })

  it('refuses bytes that are not an MP4 despite the declared type', async () => {
    await expect(putCreative(new File([new Uint8Array(1024)], 'v.mp4', { type: 'video/mp4' }))).rejects.toBe('unsupported_type')
  })

  it('putImage still refuses a video', async () => {
    await expect(putImage(new File([mp4(1024)], 'v.mp4', { type: 'video/mp4' }))).rejects.toBe('BAD_IMAGE')
  })
})

describe('caps by kind', () => {
  it('caps an image at 2 MB, a splash image at 4 MB and an MP4 at 25 MB', () => {
    expect(UPLOAD_CAP).toEqual({ image: 2 * 1024 * 1024, splash: 4 * 1024 * 1024, video: 25 * 1024 * 1024 })
    expect([MAX_IMAGE_BYTES, MAX_SPLASH_BYTES, MAX_VIDEO_BYTES]).toEqual([UPLOAD_CAP.image, UPLOAD_CAP.splash, UPLOAD_CAP.video])
  })

  it('lets the largest cap through the body check, with room for the multipart framing', () => {
    expect(MAX_UPLOAD_BODY_BYTES).toBe(MAX_VIDEO_BYTES + 65_536)
  })

  it('names the kind from the type, and the placement only tells a splash image from a card one', () => {
    expect(uploadKind('video/mp4')).toBe('video')
    expect(uploadKind('video/mp4', 'card')).toBe('video')
    expect(uploadKind('video/mp4', 'splash')).toBe('video')
    expect(uploadKind('image/png')).toBe('image')
    expect(uploadKind('image/jpeg', 'featured')).toBe('image')
    expect(uploadKind('image/webp', 'splash')).toBe('splash')
    expect(uploadKind('image/webp', 'SPLASH')).toBe('image')
  })

  it('stores a card image of exactly 2 MB and refuses one byte more', async () => {
    expect((await putCreative(new File([png(MAX_IMAGE_BYTES)], 'c.png', { type: 'image/png' }))).kind).toBe('image')
    await expect(putCreative(new File([png(MAX_IMAGE_BYTES + 1)], 'c.png', { type: 'image/png' }))).rejects.toBe('too_large')
    await expect(
      putCreative(new File([png(MAX_IMAGE_BYTES + 1)], 'c.png', { type: 'image/png' }), { placement: 'featured' }),
    ).rejects.toBe('too_large')
  })

  it('stores a splash image up to 4 MB and refuses one byte more', async () => {
    const splash = (n: number) => putCreative(new File([png(n)], 's.png', { type: 'image/png' }), { placement: 'splash' })
    expect((await splash(MAX_IMAGE_BYTES + 1)).kind).toBe('image')
    expect((await splash(MAX_SPLASH_BYTES)).kind).toBe('image')
    await expect(splash(MAX_SPLASH_BYTES + 1)).rejects.toBe('too_large')
  })

  it('still checks the bytes of a splash image, and gives an MP4 on a splash the video cap', async () => {
    await expect(
      putCreative(new File([new Uint8Array(1024)], 's.png', { type: 'image/png' }), { placement: 'splash' }),
    ).rejects.toBe('unsupported_type')
    const out = await putCreative(new File([mp4(MAX_SPLASH_BYTES + 1)], 's.mp4', { type: 'video/mp4' }), { placement: 'splash' })
    expect(out.kind).toBe('video')
  })

  it('putImage keeps the 2 MB card cap', async () => {
    await expect(putImage(new File([png(MAX_IMAGE_BYTES + 1)], 'c.png', { type: 'image/png' }))).rejects.toBe('BAD_IMAGE')
  })
})
