import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { ADVERTISERS } from '@/lib/copy-advertisers'
import { CAMPAIGN_FORM_COPY as F } from '@/lib/copy-campaign-form'
import { COMPONENTS, STATUS_LABEL } from '@/lib/copy-components'
import { HOME } from '@/lib/copy-home'
import { NOTIFY } from '@/lib/copy-notifications'
import { CAMPAIGN_COPY, PREVIEW_COPY } from '@/lib/copy-report'
import { REVIEW } from '@/lib/copy-review'
import { SHELL } from '@/lib/copy-shell'
import { fd } from '@/lib/format'
import {
  ADMIN, approveCampaign, box, expectToast, homeCard, KOLA, metricValue, openReview, queueRow, signIn, submitCampaign, TUNDE,
  type NewCampaign,
} from './helpers'

// F1: Tunde creates "Harmattan sale" as a Wall card with the seed's JPG (attached, replaced, removed, attached again,
// cleared by a switch to Video, and attached once more after a failed upload and Retry), saves it as a draft and
// reopens it from home, reviews it (going back once) and submits it. The campaign is one connected record: his page
// shows that image and that he created it, home lists it in review with the image, Global's queue shows the same
// image and his name; Global approves it, Phoenix's offers API serves that file, Tunde's home shows it Live with it,
// the bell says so, and Global's page of the workspace names him on its card.

const HARMATTAN: NewCampaign = {
  name: 'Harmattan sale',
  headline: 'Harmattan sale: 20% off 1L bottles',
  description: 'Show your claim code at any participating store for 20% off a 1L Kola Bright.',
  budgetUsd: 120,
}

// Who Tunde is (prisma/seed/users.ts), as the pages name the campaign's creator.
const TUNDE_NAME = 'Tunde Okafor'
const LAGOS = 'Africa/Lagos'

// The seed's creatives (prisma/seed/creatives): JPGs well under the 2 MB a Wall card takes.
const METRO = path.join('prisma', 'seed', 'creatives', 'metro.jpg')
const PARIEZ = path.join('prisma', 'seed', 'creatives', 'pariez.jpg')
const STORED_JPG = /^\/uploads\/[0-9a-f-]{36}\.jpg$/
// A cover drawn from that image (the browser writes the style back as `background-image: url("…")`).
const coverOf = (url: string) => new RegExp(`background-image:\\s*url\\("${url}"\\)`)

// The creative step on the form. Attach: the thumbnail is the stored file, Card preview's cover takes it at once, the
// picker says so and focus lands on Replace. Replace opens the file picker; Remove empties the zone and gives it the
// focus; attaching again stores a new file. Video can't take an image: switching takes it off and says why. An
// upload that doesn't finish says so, and Retry sends the same file again. Returns the image the campaign is
// submitted with.
async function attachReplaceRemoveReattach(page: Page): Promise<string> {
  const input = page.getByLabel(F.drop.card.label)
  const thumb = page.getByRole('img', { name: COMPONENTS.drop.chosen.image })
  const cover = box(page, F.previewBox.title).locator('.cv')
  const replace = page.getByRole('button', { name: COMPONENTS.drop.replace, exact: true })
  const zone = page.getByRole('button', { name: new RegExp(`^${F.drop.card.zoneTitle}`) })
  // The thumbnail once its upload has landed (while it uploads, it is the local file).
  async function stored(): Promise<string> {
    await expect(thumb).toBeVisible()
    await expect(thumb).toHaveAttribute('src', STORED_JPG)
    return (await thumb.getAttribute('src'))!
  }

  await input.setInputFiles(METRO)
  const first = await stored()
  await expect(page.getByText(F.upload.attached.image, { exact: true })).toBeVisible()
  await expect(replace).toBeFocused()
  await expect(cover).toHaveAttribute('style', coverOf(first))

  const chooser = page.waitForEvent('filechooser')
  await replace.click()
  await (await chooser).setFiles(PARIEZ)
  await expect(thumb).not.toHaveAttribute('src', first)
  const replaced = await stored()
  await expect(cover).toHaveAttribute('style', coverOf(replaced))

  await page.getByRole('button', { name: COMPONENTS.drop.remove, exact: true }).click()
  await expect(thumb).toHaveCount(0)
  await expect(zone).toBeFocused()
  await expect(cover).not.toHaveAttribute('style', /url\(/)

  await input.setInputFiles(METRO)
  expect(await stored()).not.toBe(first)

  await page.getByRole('button', { name: new RegExp(`^${F.placements.video.name}`) }).click()
  await expect(page.getByText(F.upload.cleared.image, { exact: true })).toBeVisible()
  await expect(thumb).toHaveCount(0)
  await page.getByRole('button', { name: new RegExp(`^${F.placements.card.name}`) }).click()
  await expect(zone).toBeVisible()

  await page.route('**/api/upload', (route) => route.abort())
  await input.setInputFiles(METRO)
  await expect(page.getByText(F.upload.failed, { exact: true })).toBeVisible()
  await expect(thumb).toHaveCount(0)
  await expect(zone).toBeFocused()
  await page.unroute('**/api/upload')
  await page.getByRole('button', { name: COMPONENTS.drop.retry, exact: true }).click()
  const final = await stored()
  await expect(replace).toBeFocused()
  await expect(cover).toHaveAttribute('style', coverOf(final))
  // The stored file is served back as the JPG it is.
  const served = await page.request.get(final)
  expect(served.headers()['content-type']).toBe('image/jpeg')
  return final
}

// Save draft keeps the half-filled form and goes home, where it waits as a Draft card with its image; the card opens
// the form again with everything restored.
async function saveDraftAndReopen(page: Page, image: string) {
  await page.getByRole('button', { name: F.buttons.saveDraft }).click()
  await page.waitForURL((url) => url.pathname === '/app')
  await expectToast(page, F.toasts.draftSaved)
  const draft = homeCard(page, HARMATTAN.headline)
  await expect(draft.getByText(STATUS_LABEL.draft, { exact: true })).toBeVisible()
  await expect(draft.getByText(HOME.draft.notSent, { exact: true })).toBeVisible()
  await expect(draft.locator('.cv')).toHaveAttribute('style', coverOf(image))
  await draft.click()
  await page.waitForURL((url) => url.pathname === '/app/campaigns/new')
  await expect(page.getByLabel(F.fields.headline.label)).toHaveValue(HARMATTAN.headline)
  await expect(page.getByRole('img', { name: COMPONENTS.drop.chosen.image })).toHaveAttribute('src', image)
}

// The Review step summarises the creative that will run. A confirmation given there is for what was reviewed: Back to
// edit returns to the form (focus on the button that opened the step), and the step opens again unconfirmed.
async function reviewTheCreative(page: Page, image: string) {
  await expect(page.getByRole('img', { name: F.review.image })).toHaveAttribute('src', image)
  const confirm = page.getByRole('checkbox', { name: F.fields.terms })
  const submit = page.getByRole('button', { name: F.buttons.submit })
  await confirm.check()
  await expect(submit).toBeEnabled()
  await page.getByRole('button', { name: F.buttons.back }).click()
  await expect(page.getByRole('button', { name: F.buttons.review })).toBeFocused()
  await expect(page.getByLabel(F.fields.headline.label)).toHaveValue(HARMATTAN.headline)
  await openReview(page, HARMATTAN)
  await expect(confirm).not.toBeChecked()
  await expect(submit).toBeDisabled()
}

test('F1: a brand previews and submits a Wall card, Global approves it, and it is live on Phoenix', async ({ browser }) => {
  const tunde = await (await browser.newContext()).newPage()
  const admin = await (await browser.newContext()).newPage()

  await test.step('the form previews the Wall card as the Phoenix user sees it', async () => {
    await signIn(tunde, TUNDE)
    await tunde.goto('/app/campaigns/new')
    await tunde.getByLabel(F.fields.headline.label).fill(HARMATTAN.headline)
    const preview = box(tunde, F.previewBox.title)
    await expect(preview.getByText(HARMATTAN.headline, { exact: true })).toBeVisible()
    await expect(preview.getByText(F.placements.card.pill, { exact: true })).toBeVisible()
    // "See it on Phoenix": the card among the offers live in Nigeria now.
    await tunde.getByRole('button', { name: F.buttons.preview }).click()
    const phoenix = tunde.getByRole('dialog', { name: PREVIEW_COPY.title })
    await expect(phoenix.getByText(HARMATTAN.headline).first()).toBeVisible()
    await phoenix.getByRole('button', { name: PREVIEW_COPY.close }).click()
    await expect(phoenix).toHaveCount(0)
  })

  let campaignPath = ''
  let image = ''
  await test.step('Tunde attaches the JPG, replaces it, removes it, attaches it again, retries a failed upload, saves a draft, reopens it from home, reviews, submits, and it waits for Global', async () => {
    campaignPath = await submitCampaign(
      tunde,
      HARMATTAN,
      async (page) => {
        image = await attachReplaceRemoveReattach(page)
        await saveDraftAndReopen(page, image)
      },
      (page) => reviewTheCreative(page, image),
    )
    await expect(tunde.getByRole('heading', { name: HARMATTAN.headline })).toBeVisible()
    await expect(tunde.getByText(STATUS_LABEL.review, { exact: true })).toBeVisible()
    await expect(tunde.getByText(CAMPAIGN_COPY.status.review)).toBeVisible()
    await expect(tunde.getByText(CAMPAIGN_COPY.daily.review)).toBeVisible()
  })

  await test.step('his page shows the image he uploaded and that he created it today; home lists it in review with that image', async () => {
    const shown = tunde.getByRole('img', { name: CAMPAIGN_COPY.offer.creative.image })
    await expect(shown).toHaveAttribute('src', image)
    expect(new URL((await shown.getAttribute('src'))!, tunde.url()).pathname.endsWith(path.basename(image))).toBe(true)
    await expect(box(tunde, CAMPAIGN_COPY.history.title).getByText(CAMPAIGN_COPY.history.created(TUNDE_NAME, fd(new Date(), LAGOS)), { exact: true })).toBeVisible()
    // The draft went with the submission.
    expect(await tunde.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('of-draft:')))).toEqual([])
    await tunde.goto('/app?filter=review')
    const card = homeCard(tunde, HARMATTAN.headline)
    await expect(card.getByText(STATUS_LABEL.review, { exact: true })).toBeVisible()
    await expect(card.locator('.cv')).toHaveAttribute('style', coverOf(image))
  })

  await test.step("Global's queue shows the same image and who created it, and Global approves it", async () => {
    await signIn(admin, ADMIN)
    await admin.goto('/admin/review')
    const row = queueRow(admin, HARMATTAN.headline)
    await expect(row.getByText(REVIEW.queue.createdBy(TUNDE_NAME))).toBeVisible()
    await expect(row.locator('.cv')).toHaveAttribute('style', coverOf(image))
    await approveCampaign(admin, HARMATTAN.headline)
  })

  await test.step("Phoenix's offers API serves that file for the live offer", async () => {
    const id = campaignPath.split('/').pop()!
    const res = await admin.request.get('/api/v1/offers?country=NG', {
      headers: { Authorization: `Bearer ${process.env.DEMO_CHANNEL_KEY ?? 'phx_dev_oshofree'}` },
    })
    expect(res.status()).toBe(200)
    const offer = (await res.json()).offers.find((o: { id: string }) => o.id === id)
    expect(offer).toMatchObject({ placement: 'card', headline: HARMATTAN.headline, creative: { video: null } })
    expect(new URL(offer.creative.image).pathname).toBe(image)
    const file = await admin.request.get(offer.creative.image)
    expect(file.status()).toBe(200)
    expect(file.headers()['content-type']).toBe('image/jpeg')
  })

  await test.step("Tunde's home shows it Live, and the bell says it is live on Phoenix", async () => {
    await tunde.goto('/app')
    await tunde.getByRole('button', { name: new RegExp(`^${HOME.pills.live}`) }).click()
    await tunde.waitForURL('**/app?filter=live')
    const card = homeCard(tunde, HARMATTAN.headline)
    await expect(card.getByText(STATUS_LABEL.live, { exact: true })).toBeVisible()
    await expect(card).toHaveAttribute('href', campaignPath)
    await expect(card.locator('.cv')).toHaveAttribute('style', coverOf(image))

    await tunde.getByRole('button', { name: SHELL.bell.label }).click()
    const bell = tunde.getByRole('region', { name: SHELL.bell.label })
    await expect(bell.getByText(NOTIFY.live(HARMATTAN.name).title)).toBeVisible()
  })

  await test.step('its page says Live, with Pause to hand and nothing delivered yet', async () => {
    await tunde.goto(campaignPath)
    await expect(tunde.getByText(STATUS_LABEL.live, { exact: true })).toBeVisible()
    await expect(tunde.getByRole('button', { name: HOME.pause, exact: true })).toBeVisible()
    await expect(metricValue(tunde, CAMPAIGN_COPY.kpi.impressions)).toHaveText('0')
    await expect(tunde.getByRole('img', { name: CAMPAIGN_COPY.offer.creative.image })).toHaveAttribute('src', image)
  })

  await test.step("Global's page of the workspace names Tunde on the campaign's card", async () => {
    await admin.goto('/admin/advertisers')
    await admin.locator('table').getByRole('link', { name: KOLA, exact: true }).click()
    await admin.waitForURL(/\/admin\/advertisers\/[^/]+$/)
    const card = box(admin, ADVERTISERS.detail.campaigns).getByRole('link').filter({ hasText: HARMATTAN.headline })
    await expect(card.getByText(COMPONENTS.card.createdBy(TUNDE_NAME), { exact: true })).toBeVisible()
  })

  await tunde.context().close()
  await admin.context().close()
})
