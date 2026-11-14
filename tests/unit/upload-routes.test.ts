import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { VIDEO_KEY_RE } from '@/lib/image-rules'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/upload/route'
import { GET } from '@/app/uploads/[key]/route'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/session', () => ({ requireUser: vi.fn().mockResolvedValue({ id: 'u1' }) }))

const png = () => {
  const b = new Uint8Array(2048)
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return b
}
// A real browser request carries Content-Length; a Request built from FormData does not, so add it.
async function upload(file: File) {
  const form = new FormData()
  form.set('file', file)
  const draft = new Request('http://localhost/api/upload', { method: 'POST', body: form })
  const body = await draft.arrayBuffer()
  const headers = { 'content-type': draft.headers.get('content-type')!, 'content-length': String(body.byteLength) }
  return POST(new Request('http://localhost/api/upload', { method: 'POST', body, headers }))
}
const fetchImage = (key: string) =>
  GET(new Request(`http://localhost/uploads/${key}`), { params: Promise.resolve({ key }) })

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'oshofree-routes-'))
  process.env.UPLOAD_DIR = dir
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('POST /api/upload then GET /uploads/[key]', () => {
  it('stores a png and serves it back as image/png', async () => {
    const res = await upload(new File([png()], 'card.png', { type: 'image/png' }))
    expect(res.status).toBe(200)
    const { key, url } = await res.json()
    expect(url).toBe(`/uploads/${key}`)
    const img = await fetchImage(key)
    expect(img.status).toBe(200)
    expect(img.headers.get('content-type')).toBe('image/png')
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(png())
  })

  it('answers 400 BAD_IMAGE for a file it will not store', async () => {
    const res = await upload(new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'BAD_IMAGE' })
  })

  it('answers 413 for an oversized or unsized body without reading it', async () => {
    let pulled = false
    // highWaterMark 0: the stream is pulled only when someone reads the body.
    const body = () =>
      new ReadableStream(
        {
          pull() {
            pulled = true
            throw new Error('the body was read')
          },
        },
        { highWaterMark: 0 },
      )
    const send = (headers: Record<string, string>) =>
      POST(new Request('http://localhost/api/upload', { method: 'POST', body: body(), headers, duplex: 'half' } as RequestInit))
    for (const length of ['50000000', 'lots', undefined]) {
      const res = await send(length === undefined ? {} : { 'content-length': length })
      expect(res.status).toBe(413)
      expect(await res.json()).toEqual({ error: 'BAD_IMAGE' })
    }
    expect(pulled).toBe(false)
  })

  it('refuses keys that are not ours, including path tricks', async () => {
    await writeFile(path.join(dir, 'secret.txt'), 'x')
    for (const key of ['../.env', 'secret.txt', '..%2F.env', '00000000-0000-0000-0000-000000000000.png']) {
      expect((await fetchImage(key)).status).toBe(404)
    }
  })

  const mp4 = (n: number) => {
    const b = new Uint8Array(n)
    b.set([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70])
    return b
  }

  it('stores an MP4 as a video and serves it as video/mp4 with range support', async () => {
    const res = await upload(new File([mp4(4096)], 'v.mp4', { type: 'video/mp4' }))
    expect(res.status).toBe(200)
    const { key, kind } = await res.json()
    expect(kind).toBe('video')
    expect(key).toMatch(VIDEO_KEY_RE)
    const vid = await fetchImage(key)
    expect(vid.headers.get('content-type')).toBe('video/mp4')
    expect(vid.headers.get('accept-ranges')).toBe('bytes')
    const part = await GET(new Request(`http://localhost/uploads/${key}`, { headers: { range: 'bytes=0-9' } }), {
      params: Promise.resolve({ key }),
    })
    expect(part.status).toBe(206)
    expect(part.headers.get('content-range')).toBe('bytes 0-9/4096')
    expect((await part.arrayBuffer()).byteLength).toBe(10)
  })

  it('answers too_large for a file over 2 MB and BAD_IMAGE for a type it will not store', async () => {
    const big = await upload(new File([mp4(2_097_153)], 'v.mp4', { type: 'video/mp4' }))
    expect(big.status).toBe(413)
    expect(await big.json()).toEqual({ error: 'too_large' })
    for (const f of [
      new File([mp4(1024)], 'v.mov', { type: 'video/quicktime' }),
      new File([new Uint8Array(1024)], 'a.gif', { type: 'image/gif' }),
    ]) {
      const res = await upload(f)
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'BAD_IMAGE' })
    }
  })
})
