import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { CAMPAIGN_FORM_COPY as F } from '@/lib/copy-campaign-form'
import { COMPONENTS, STATUS_LABEL } from '@/lib/copy-components'
import { HOME } from '@/lib/copy-home'
import { NOTIFY } from '@/lib/copy-notifications'
import { CAMPAIGN_COPY, PREVIEW_COPY } from '@/lib/copy-report'
import { SHELL } from '@/lib/copy-shell'
import {
  ADMIN, approveCampaign, box, homeCard, metricValue, signIn, submitCampaign, TUNDE, type NewCampaign,
} from './helpers'

// F1: Tunde creates "Harmattan sale" as a Wall card with the seed's JPG (attached, replaced, removed, attached again,
// cleared by a switch to Video, and attached once more after a failed upload and Retry) and submits it; it waits in review; Global approves it from the queue; Tunde's home shows it Live, with
// that image, and the bell says so.

const HARMATTAN: NewCampaign = {
  name: 'Harmattan sale',
  headline: 'Harmattan sale: 20% off 1L bottles',
  description: 'Show your claim code at any participating store for 20% off a 1L Kola Bright.',
  budgetUsd: 120,
}

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
  await test.step('Tunde attaches the JPG, replaces it, removes it, attaches it again, retries a failed upload, submits, and it waits for Global', async () => {
    campaignPath = await submitCampaign(tunde, HARMATTAN, async (page) => {
      image = await attachReplaceRemoveReattach(page)
    })
    await expect(tunde.getByRole('heading', { name: HARMATTAN.headline })).toBeVisible()
    await expect(tunde.getByText(STATUS_LABEL.review, { exact: true })).toBeVisible()
    await expect(tunde.getByText(CAMPAIGN_COPY.status.review)).toBeVisible()
    await expect(tunde.getByText(CAMPAIGN_COPY.daily.review)).toBeVisible()
  })

  await test.step('Global approves it from the queue', async () => {
    await signIn(admin, ADMIN)
    await approveCampaign(admin, HARMATTAN.headline)
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
  })

  await tunde.context().close()
  await admin.context().close()
})
