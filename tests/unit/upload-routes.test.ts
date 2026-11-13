import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
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
const upload = (file: File) => {
  const body = new FormData()
  body.set('file', file)
  return POST(new Request('http://localhost/api/upload', { method: 'POST', body }))
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

  it('refuses keys that are not ours, including path tricks', async () => {
    await writeFile(path.join(dir, 'secret.txt'), 'x')
    for (const key of ['../.env', 'secret.txt', '..%2F.env', '00000000-0000-0000-0000-000000000000.png']) {
      expect((await fetchImage(key)).status).toBe(404)
    }
  })
})
