import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { MAX_IMAGE_BYTES, MAX_SPLASH_BYTES, MAX_VIDEO_BYTES, VIDEO_KEY_RE } from '@/lib/image-rules'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/upload/route'
import { DELETE } from '@/app/api/upload/[key]/route'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/session'
import { GET } from '@/app/uploads/[key]/route'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/session', () => ({ requireUser: vi.fn().mockResolvedValue({ id: 'u1' }) }))

const png = (n = 2048) => {
  const b = new Uint8Array(n)
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return b
}
// A real browser request carries Content-Length; a Request built from FormData does not, so add it. The
// picker sends the placement beside the file.
async function upload(file: File, placement?: string) {
  const form = new FormData()
  if (placement !== undefined) form.set('placement', placement)
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
    b.set([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d])
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

  it('answers too_large past the cap for the kind, and BAD_IMAGE for a type it will not store', async () => {
    const big = await upload(new File([mp4(MAX_VIDEO_BYTES + 1)], 'v.mp4', { type: 'video/mp4' }))
    expect(big.status).toBe(413)
    expect(await big.json()).toEqual({ error: 'too_large' })
    for (const placement of [undefined, 'card', 'featured', 'video']) {
      const card = await upload(new File([png(MAX_IMAGE_BYTES + 1)], 'c.png', { type: 'image/png' }), placement)
      expect(card.status).toBe(413)
      expect(await card.json()).toEqual({ error: 'too_large' })
    }
    const splash = await upload(new File([png(MAX_SPLASH_BYTES + 1)], 's.png', { type: 'image/png' }), 'splash')
    expect(splash.status).toBe(413)
    expect(await splash.json()).toEqual({ error: 'too_large' })
    for (const f of [
      new File([mp4(1024)], 'v.mov', { type: 'video/quicktime' }),
      new File([new Uint8Array(1024)], 'a.gif', { type: 'image/gif' }),
    ]) {
      const res = await upload(f)
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'BAD_IMAGE' })
    }
  })

  it('stores a splash image over 2 MB and an MP4 over 2 MB', async () => {
    const splash = await upload(new File([png(MAX_SPLASH_BYTES)], 's.png', { type: 'image/png' }), 'splash')
    expect(splash.status).toBe(200)
    expect((await splash.json()).kind).toBe('image')
    const video = await upload(new File([mp4(3 * 1024 * 1024)], 'v.mp4', { type: 'video/mp4' }), 'video')
    expect(video.status).toBe(200)
    expect((await video.json()).kind).toBe('video')
  })

  it('serves a video by range: an open end, a suffix, and 416 past the end', async () => {
    const { key } = await (await upload(new File([mp4(4096)], 'v.mp4', { type: 'video/mp4' }), 'video')).json()
    const get = (range: string) =>
      GET(new Request(`http://localhost/uploads/${key}`, { headers: { range } }), { params: Promise.resolve({ key }) })
    const tail = await get('bytes=4000-')
    expect(tail.status).toBe(206)
    expect(tail.headers.get('content-range')).toBe('bytes 4000-4095/4096')
    expect(tail.headers.get('content-length')).toBe('96')
    expect((await tail.arrayBuffer()).byteLength).toBe(96)
    const suffix = await get('bytes=-8')
    expect(suffix.status).toBe(206)
    expect(suffix.headers.get('content-range')).toBe('bytes 4088-4095/4096')
    const past = await get('bytes=5000-')
    expect(past.status).toBe(416)
    expect(past.headers.get('content-range')).toBe('bytes */4096')
    // A first request with bytes=0- is how Chrome starts a <video>: the whole file, as partial content.
    const whole = await get('bytes=0-')
    expect(whole.status).toBe(206)
    expect(whole.headers.get('content-range')).toBe('bytes 0-4095/4096')
  })
})

describe('POST /api/upload: the server judges the bytes, not the name or the declared type', () => {
  it('refuses a PNG renamed .mp4 (the browser declares it video/mp4), and stores nothing', async () => {
    const res = await upload(new File([png()], 'clip.mp4', { type: 'video/mp4' }), 'video')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'BAD_IMAGE' })
    expect(await db.creativeUpload.count()).toBe(0)
  })
})

describe('DELETE /api/upload/[key]: a file the form let go of', () => {
  const as = (id: string) => vi.mocked(requireUser).mockResolvedValue({ id, email: '', name: '', isGlobalAdmin: false })
  const remove = (key: string) => DELETE(new Request(`http://localhost/api/upload/${key}`, { method: 'DELETE' }), { params: Promise.resolve({ key }) })
  async function uploaded(by = 'u1'): Promise<string> {
    as(by)
    const res = await upload(new File([png()], 'card.png', { type: 'image/png' }))
    return (await res.json()).key
  }
  async function campaignNaming(data: { creativeImageKey?: string; creativeVideoKey?: string }) {
    const ws = await db.workspace.create({ data: { name: 'Kola Bright', type: 'Brand', country: 'NG' } })
    return db.campaign.create({
      data: {
        workspaceId: ws.id, name: 'n', brand: 'Kola Bright', country: 'NG', category: 'Food & drink', headline: 'h', description: 'd',
        placement: 'card', redeemMethod: 'code', budgetUsd: 100, startsAt: new Date(), endsAt: new Date(), shareRewardLabel: 'r', ...data,
      },
    })
  }

  afterEach(() => as('u1'))

  it('records who uploaded each file', async () => {
    const key = await uploaded('u7')
    expect(await db.creativeUpload.findUnique({ where: { key } })).toMatchObject({ key, userId: 'u7' })
  })

  it('deletes the file and its record for the person who uploaded it; it is no longer served', async () => {
    const key = await uploaded()
    expect((await remove(key)).status).toBe(204)
    expect((await fetchImage(key)).status).toBe(404)
    expect(await db.creativeUpload.count()).toBe(0)
    // Gone already: nothing left to delete.
    expect((await remove(key)).status).toBe(404)
  })

  it("is 404 for someone else's upload, a file nobody recorded (the seed's), or a key that is not ours; each file stays", async () => {
    const key = await uploaded('u1')
    as('u2')
    expect((await remove(key)).status).toBe(404)
    await writeFile(path.join(dir, '5eed0000-0000-4000-8000-000000000001.jpg'), png())
    for (const k of ['5eed0000-0000-4000-8000-000000000001.jpg', '../.env', 'secret.txt']) expect((await remove(k)).status).toBe(404)
    expect((await fetchImage(key)).status).toBe(200)
    expect((await fetchImage('5eed0000-0000-4000-8000-000000000001.jpg')).status).toBe(200)
  })

  it('keeps a file a campaign runs, or a revision names: 409', async () => {
    const image = await uploaded()
    await campaignNaming({ creativeImageKey: image })
    expect((await remove(image)).status).toBe(409)
    expect((await fetchImage(image)).status).toBe(200)

    const revised = await uploaded()
    const c = await campaignNaming({})
    await db.campaignRevision.create({ data: { campaignId: c.id, data: { headline: 'h', creativeImageKey: revised } } })
    expect((await remove(revised)).status).toBe(409)
    expect((await fetchImage(revised)).status).toBe(200)
    expect(await db.creativeUpload.count()).toBe(2)
  })
})
