import { readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { expect, test, type Locator, type Page, type Response } from '@playwright/test'
import { CAMPAIGN_FORM_COPY as F } from '@/lib/copy-campaign-form'
import { COMPONENTS } from '@/lib/copy-components'
import { CAMPAIGN_COPY, PREVIEW_COPY } from '@/lib/copy-report'
import { box, CAMPAIGN_PAGE, expectToast, signIn } from './helpers'

// Slice 2, Prompt 2: the creative upload with real files (tests/fixtures: a 360 × 640 PNG, a 400 × 400 WebP and an
// 8 s H.264 MP4, all made in Chromium; the seed's JPGs). Pesa Link's owner (Kenya) uploads, so the Kola Bright and
// MediaSpec numbers the other specs read are left alone. An image is shown from the stored file, replaced, removed and
// attached again (the replaced file is deleted); a refused type or size is said before anything is sent; the upload
// shows its progress; a failed upload offers Retry. A video plays and seeks, on the form, the Review step and the
// campaign page; a splash fills the phone and opens full size; Edit offer removes and replaces the video.

const WANJIRU = 'wanjiru@pesalink.demo'
const FIXTURES = path.join('tests', 'fixtures')
const PNG = path.join(FIXTURES, 'splash.png')
const WEBP = path.join(FIXTURES, 'square.webp')
const MP4 = path.join(FIXTURES, 'clip.mp4')
const JPG = path.join('prisma', 'seed', 'creatives', 'metro.jpg')
const STORED = (ext: string) => new RegExp(`^/uploads/[0-9a-f-]{36}\\.${ext}$`)
const U = F.upload
const D = COMPONENTS.drop

// The offer's words, a code offer at the minimum budget (only the creative differs between the tests).
async function fillOffer(page: Page, name: string) {
  await page.goto('/app/campaigns/new')
  await page.getByLabel(F.fields.name.label).fill(name)
  await page.getByLabel(F.fields.headline.label).fill(`${name}: 10% off transfers`)
  await page.getByLabel(F.fields.description.label).fill('Send money home with Pesa Link this week and pay 10% less in fees.')
  await page.getByLabel(F.fields.redeem.label).selectOption('code')
  await page.getByLabel(F.fields.budget.label).fill('60')
}
const tile = (page: Page, placement: 'card' | 'featured' | 'video' | 'splash') =>
  page.getByRole('button', { name: new RegExp(`^${F.placements[placement].name}`) })
const zone = (page: Page, title: string) => page.getByRole('button', { name: new RegExp(`^${title}`) })
const message = (page: Page) => page.locator('.dmsg')
const hint = (page: Page) => page.locator('#cf-hint')

// The image as the browser decoded it: the stored file's bytes, not a placeholder.
async function decodedWidth(img: Locator): Promise<number> {
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBeGreaterThan(0)
  return img.evaluate((i: HTMLImageElement) => i.naturalWidth)
}

// Every MP4 response the page has had: the browser asks for a video by range, and the server answers 206.
function mp4Responses(page: Page): Response[] {
  const seen: Response[] = []
  page.on('response', (r) => /\/uploads\/[0-9a-f-]{36}\.mp4/.test(r.url()) && seen.push(r))
  return seen
}

// A <video> that has its first frame (readyState 2+) and its length, then plays forward from a seek. Its file came
// by Range requests (206, video/mp4, the whole file's size in Content-Range).
async function plays(video: Locator, seen: Response[]) {
  await expect(video).toHaveAttribute('controls', '')
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThanOrEqual(2)
  expect(await video.evaluate((v: HTMLVideoElement) => v.duration)).toBeGreaterThan(6)
  const key = (await video.getAttribute('src'))!.replace(/#.*$/, '')
  await video.evaluate(async (v: HTMLVideoElement) => {
    v.muted = true
    v.currentTime = 5
    await new Promise((done) => v.addEventListener('seeked', done, { once: true }))
    await v.play()
  })
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(5.2)
  expect(await video.evaluate((v: HTMLVideoElement) => v.error)).toBeNull()
  await video.evaluate((v: HTMLVideoElement) => v.pause())
  const partial = seen.find((r) => r.url().includes(key) && r.status() === 206)
  expect(partial, `a 206 for ${key}`).toBeDefined()
  expect(partial!.headers()['content-type']).toBe('video/mp4')
  expect(partial!.headers()['content-range']).toMatch(/^bytes \d+-\d+\/\d+$/)
}

test('a Wall card: the stored image shows, is replaced (the old file deleted), removed and attached again; refusals, progress and Retry; submitted', async ({ page }) => {
  await signIn(page, WANJIRU)
  await fillOffer(page, 'Pesa week')
  const input = page.getByLabel(F.drop.card.label)
  const thumb = page.getByRole('img', { name: D.chosen.image })
  const cover = box(page, F.previewBox.title).locator('.cv')
  const posts: string[] = []
  page.on('request', (r) => r.method() === 'POST' && r.url().endsWith('/api/upload') && posts.push(r.url()))

  await test.step('a PNG shows from its stored file, decoded at its own size', async () => {
    await input.setInputFiles(PNG)
    await expect(thumb).toHaveAttribute('src', STORED('png'))
    expect(await decodedWidth(thumb)).toBe(360)
    await expect(message(page)).toHaveText(U.attached.image)
    await expect(cover).toHaveAttribute('style', /url\("\/uploads\/[0-9a-f-]{36}\.png"\)/)
  })

  await test.step('Replace with a WebP: the new image shows, the rest of the form stays, the PNG is deleted from the server', async () => {
    const png = (await thumb.getAttribute('src'))!
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: D.replace, exact: true }).click()
    await (await chooser).setFiles(WEBP)
    await expect(thumb).toHaveAttribute('src', STORED('webp'))
    expect(await decodedWidth(thumb)).toBe(400)
    await expect(page.getByLabel(F.fields.name.label)).toHaveValue('Pesa week')
    await expect(page.getByLabel(F.fields.budget.label)).toHaveValue('60')
    // Deleted once the autosaved draft no longer names it.
    await expect.poll(async () => (await page.request.get(png)).status()).toBe(404)
  })

  await test.step('Remove empties the zone and gives it the focus; a Wall card needs no image, so the form can go on', async () => {
    await page.getByRole('button', { name: D.remove, exact: true }).click()
    await expect(thumb).toHaveCount(0)
    await expect(zone(page, F.drop.card.zoneTitle)).toBeFocused()
    await expect(page.getByRole('button', { name: F.buttons.review })).toBeEnabled()
  })

  await test.step('a GIF and a file over 2 MB are refused with their sentence before anything is sent', async () => {
    const before = posts.length
    await input.setInputFiles({ name: 'anim.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') })
    await expect(message(page)).toHaveText(U.wrongImage('a GIF'))
    await expect(message(page)).toHaveClass(/bad/)
    const big = Buffer.alloc(2_200_000)
    big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    await input.setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: big })
    await expect(message(page)).toHaveText(U.tooLarge('2.1 MB', '2 MB'))
    expect(posts.length).toBe(before)
    await expect(page.getByRole('button', { name: D.retry })).toHaveCount(0)
  })

  await test.step('while a file uploads: its progress, "Uploading…" by the buttons, and Save draft and Start over wait', async () => {
    let release!: () => void
    const held = new Promise<void>((r) => (release = r))
    await page.route('**/api/upload', async (route) => {
      await held
      await route.continue()
    })
    await input.setInputFiles(JPG)
    const bar = page.getByRole('progressbar', { name: D.uploading })
    await expect(bar).toBeVisible()
    await expect(bar).toHaveAttribute('aria-valuenow', /^\d{1,3}$/)
    await expect(message(page)).toContainText(new RegExp(`^${D.uploading}\\d{1,3}%$`))
    await expect(hint(page)).toHaveText(U.uploading)
    await expect(page.getByRole('button', { name: F.buttons.saveDraft })).toBeDisabled()
    await expect(page.getByRole('button', { name: F.buttons.startOver })).toBeDisabled()
    // The file's own preview, dimmed, while it goes.
    await expect(page.locator('.drop[data-state=uploading] img')).toHaveAttribute('src', /^blob:/)
    release()
    await expect(thumb).toHaveAttribute('src', STORED('jpg'))
    await page.unroute('**/api/upload')
  })

  await test.step('a server error says the upload did not finish, with Retry, and Retry sends the same file again', async () => {
    const jpg = (await thumb.getAttribute('src'))!
    await page.getByRole('button', { name: D.remove, exact: true }).click()
    await page.route('**/api/upload', (route) => route.fulfill({ status: 500, body: '' }))
    await input.setInputFiles(PNG)
    await expect(message(page)).toContainText(U.failed)
    await expect(message(page)).toHaveClass(/bad/)
    await expect(thumb).toHaveCount(0)
    await page.unroute('**/api/upload')
    await page.getByRole('button', { name: D.retry, exact: true }).click()
    await expect(thumb).toHaveAttribute('src', STORED('png'))
    await expect(page.getByRole('button', { name: D.replace, exact: true })).toBeFocused()
    await expect.poll(async () => (await page.request.get(jpg)).status()).toBe(404)
  })

  await test.step('submitted: the campaign page shows that file', async () => {
    const image = (await thumb.getAttribute('src'))!
    await page.getByRole('button', { name: F.buttons.review }).click()
    await expect(page.getByRole('img', { name: F.review.image })).toHaveAttribute('src', image)
    await page.getByRole('checkbox', { name: F.fields.terms }).check()
    await page.getByRole('button', { name: F.buttons.submit }).click()
    await page.waitForURL(CAMPAIGN_PAGE)
    await expectToast(page, F.toasts.submitted)
    const shown = page.getByRole('img', { name: CAMPAIGN_COPY.offer.creative.image })
    await expect(shown).toHaveAttribute('src', image)
    expect(await decodedWidth(shown)).toBe(360)
    const served = await page.request.get(image)
    expect(served.headers()['content-type']).toBe('image/png')
    // Kept: a campaign names it.
    expect((await page.request.delete(`/api/upload/${path.basename(image)}`)).status()).toBe(409)
  })
})

test('Video and Splash: an MP4 plays and seeks on the form, the Review step and the campaign page; a splash fills the phone; Edit offer removes and replaces the video', async ({ page }) => {
  await signIn(page, WANJIRU)
  await fillOffer(page, 'Pesa clip')
  const input = page.getByLabel(F.drop.video.label)
  const seen = mp4Responses(page)

  await test.step('Video asks for a creative: pressing on marks the zone, focuses it, and says why beside it', async () => {
    await tile(page, 'video').click()
    await expect(hint(page)).toHaveText(F.validation.creative)
    await page.getByRole('button', { name: F.buttons.review }).click({ force: true })
    const empty = zone(page, F.drop.video.zoneTitle)
    await expect(empty).toBeFocused()
    await expect(empty).toHaveAttribute('aria-invalid', 'true')
    await expect(empty).toHaveAccessibleDescription(F.validation.creative)
    await expect(page.locator('.drop')).toHaveAttribute('data-invalid', '')
  })

  await test.step('a PNG renamed .mp4 is refused: in the browser (no length to read), and by the server from its bytes', async () => {
    const png = readFileSync(PNG)
    await input.setInputFiles({ name: 'clip.mp4', mimeType: 'video/mp4', buffer: png })
    await expect(message(page)).toHaveText(U.bad)
    const res = await page.request.post('/api/upload', {
      multipart: { placement: 'video', file: { name: 'clip.mp4', mimeType: 'video/mp4', buffer: png } },
    })
    expect(res.status()).toBe(400)
    await input.setInputFiles(JPG)
    await expect(message(page)).toHaveText(U.wrongVideo)
  })

  await test.step('the MP4 plays with native controls and seeks (206); the zone is no longer marked', async () => {
    await input.setInputFiles(MP4)
    const video = page.getByLabel(D.chosen.video)
    await expect(video).toHaveAttribute('src', /^\/uploads\/[0-9a-f-]{36}\.mp4#t=0\.1$/)
    await plays(video, seen)
    await expect(page.getByRole('button', { name: D.replace, exact: true })).not.toHaveAttribute('aria-invalid', 'true')
    await expect(page.locator('.drop')).not.toHaveAttribute('data-invalid', '')
    await expect(hint(page)).not.toHaveText(F.validation.creative)
  })

  await test.step('Splash keeps the video, in the phone; Remove, then a PNG fills the phone and View full size opens it', async () => {
    await tile(page, 'splash').click()
    const thumb = page.getByRole('img', { name: F.drop.splashFrame })
    await expect(thumb.locator('.splash video')).toHaveAttribute('src', /\.mp4#t=0\.1$/)
    await page.getByRole('button', { name: D.remove, exact: true }).click()
    await expect(hint(page)).toHaveText(F.validation.creative)
    await page.getByLabel(F.drop.splash.label).setInputFiles(PNG)
    const art = thumb.locator('.splash img')
    await expect(art).toHaveAttribute('src', STORED('png'))
    expect(await decodedWidth(art)).toBe(360)
    // The splash covers the phone's screen, which the thumbnail draws at 40%.
    const screen = await thumb.locator('.splash').boundingBox()
    expect(screen!.height / screen!.width).toBeGreaterThan(1.7)
    await page.getByRole('button', { name: F.drop.viewFull }).click()
    const dialog = page.getByRole('dialog', { name: PREVIEW_COPY.title })
    await expect(dialog.getByRole('tab', { name: F.placements.splash.name, exact: true })).toHaveAttribute('aria-selected', 'true')
    const full = dialog.locator('.splash img')
    await expect(full).toHaveAttribute('src', (await art.getAttribute('src'))!)
    const size = await dialog.locator('.splash').boundingBox()
    expect(size!.width).toBeGreaterThan(200)
    expect(size!.height / size!.width).toBeGreaterThan(1.7)
    await dialog.getByRole('button', { name: PREVIEW_COPY.close }).click()
  })

  await test.step('back to Video: the image goes, saying why; the MP4 again', async () => {
    await tile(page, 'video').click()
    await expect(message(page)).toHaveText(U.cleared.image)
    await input.setInputFiles(MP4)
    await expect(page.locator('.drop video')).toHaveAttribute('src', /\.mp4#t=0\.1$/)
  })

  await test.step("a file gone from the server by Submit: back on the form, the creative off, its zone marked and focused", async () => {
    const stored = (await page.getByLabel(D.chosen.video).getAttribute('src'))!.replace(/#t=0\.1$/, '')
    rmSync(path.resolve(process.env.UPLOAD_DIR ?? '.uploads-test', path.basename(stored)))
    await page.getByRole('button', { name: F.buttons.review }).click()
    await page.getByRole('checkbox', { name: F.fields.terms }).check()
    await page.getByRole('button', { name: F.buttons.submit }).click()
    const empty = zone(page, F.drop.video.zoneTitle)
    await expect(empty).toBeFocused()
    await expect(empty).toHaveAttribute('aria-invalid', 'true')
    await expect(empty).toHaveAccessibleDescription(F.validation.creativeMissing)
    await expect(hint(page)).toHaveText(F.validation.creativeMissing)
    await expect(page.getByLabel(D.chosen.video)).toHaveCount(0)
    // Attached again, the mark goes.
    await input.setInputFiles(MP4)
    await expect(page.getByLabel(D.chosen.video)).toHaveAttribute('src', /\.mp4#t=0\.1$/)
    await expect(page.locator('.drop')).not.toHaveAttribute('data-invalid', '')
  })

  let video = ''
  await test.step('the Review step plays it; submitted, the campaign page plays it', async () => {
    video = (await page.locator('.drop video').getAttribute('src'))!.replace(/#t=0\.1$/, '')
    await page.getByRole('button', { name: F.buttons.review }).click()
    const reviewed = page.getByLabel(F.review.video)
    await expect(reviewed).toHaveAttribute('src', `${video}#t=0.1`)
    await plays(reviewed, seen)
    await page.getByRole('checkbox', { name: F.fields.terms }).check()
    await page.getByRole('button', { name: F.buttons.submit }).click()
    await page.waitForURL(CAMPAIGN_PAGE)
    await expectToast(page, F.toasts.submitted)
    const shown = page.getByLabel(CAMPAIGN_COPY.offer.creative.video)
    await expect(shown).toHaveAttribute('src', `${video}#t=0.1`)
    await plays(shown, seen)
  })

  await test.step('Edit offer: Remove leaves Save and resubmit waiting with the reason; a new MP4 is saved and plays', async () => {
    const campaignPath = new URL(page.url()).pathname
    await page.getByRole('link', { name: CAMPAIGN_COPY.offer.edit }).click()
    await page.waitForURL(`**${campaignPath}/edit`)
    await expect(page.locator('.drop video')).toHaveAttribute('src', `${video}#t=0.1`)
    await page.getByRole('button', { name: D.remove, exact: true }).click()
    await expect(hint(page)).toHaveText(F.validation.creative)
    const save = page.getByRole('button', { name: F.buttons.saveResubmit })
    await expect(save).toHaveAttribute('aria-disabled', 'true')
    await page.getByLabel(F.drop.video.label).setInputFiles(MP4)
    const replaced = page.locator('.drop video')
    await expect(replaced).toHaveAttribute('src', /\.mp4#t=0\.1$/)
    await expect(replaced).not.toHaveAttribute('src', `${video}#t=0.1`)
    const next = (await replaced.getAttribute('src'))!
    await page.getByRole('checkbox', { name: F.fields.terms }).check()
    await save.click()
    await page.waitForURL((url) => url.pathname === campaignPath)
    await expectToast(page, F.toasts.resubmitted)
    const shown = page.getByLabel(CAMPAIGN_COPY.offer.creative.video)
    await expect(shown).toHaveAttribute('src', next)
    await plays(shown, seen)
  })
})
