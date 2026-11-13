import { describe, expect, it, vi } from 'vitest'
import AdvertisersPage from '@/app/admin/advertisers/page'
import ApiDocsPage from '@/app/admin/api/page'
import ReviewPage from '@/app/admin/review/page'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

// Next can render a page without its layout (an RSC request names the segment it wants), so each
// /admin page must refuse a non-admin itself. notFound() throws an error whose digest says 404.
const NOT_FOUND = /NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK;404/

const pages = { review: ReviewPage, advertisers: AdvertisersPage, api: ApiDocsPage }
const render = (Page: () => unknown) => Promise.resolve().then(() => Page())

async function signIn(isGlobalAdmin: boolean, claimInJwt = isGlobalAdmin) {
  const user = await db.user.create({ data: { email: 'u@x.test', name: 'U', passwordHash: 'x', isGlobalAdmin } })
  vi.mocked(auth).mockResolvedValue({ user: { id: user.id, isGlobalAdmin: claimInJwt }, expires: '' } as never)
}

describe('/admin pages', () => {
  for (const [name, Page] of Object.entries(pages)) {
    it(`${name} answers 404 to a signed-in non-admin, even one whose token still says admin`, async () => {
      for (const claimInJwt of [false, true]) {
        await db.user.deleteMany()
        await signIn(false, claimInJwt)
        await expect(render(Page)).rejects.toMatchObject({ digest: expect.stringMatching(NOT_FOUND) })
      }
    })

    it(`${name} renders for an admin`, async () => {
      await signIn(true)
      await expect(render(Page)).resolves.toBeTruthy()
    })
  }
})
