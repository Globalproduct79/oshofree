import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { imageUrl, putImage } from '@/lib/storage'

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
