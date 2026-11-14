import { expect, test, type Page } from '@playwright/test'
import { CAMPAIGN } from '@/lib/copy-campaign'
import { STATUS_LABEL } from '@/lib/copy-components'
import { HOME } from '@/lib/copy-home'
import { CAMPAIGN_COPY } from '@/lib/copy-report'
import { ADMIN, approveCampaign, expectToast, signIn, submitCampaign, TUNDE, type NewCampaign } from './helpers'

// F3: pause a live campaign, resume it, then end it now through the confirm and see what it released.
// The seeded campaigns stay as they are: this spec ends a campaign of its own.

const C = CAMPAIGN_COPY.change

const FLASH: NewCampaign = {
  name: 'Weekend flash sale',
  headline: 'Weekend flash: a free 35cl with any crate',
  description: 'Buy a crate of Kola Bright this weekend and show your claim code for a free 35cl bottle.',
  budgetUsd: 90,
}

test.describe.configure({ mode: 'serial' })

let tunde: Page
let campaignPath = ''

test.beforeAll(async ({ browser }) => {
  tunde = await (await browser.newContext()).newPage()
  const admin = await (await browser.newContext()).newPage()
  await signIn(tunde, TUNDE)
  campaignPath = await submitCampaign(tunde, FLASH)
  await signIn(admin, ADMIN)
  await approveCampaign(admin, FLASH.headline)
  await admin.context().close()
})

test.afterAll(async () => {
  await tunde.context().close()
})

// The status pill under the headline.
const badge = (page: Page, status: keyof typeof STATUS_LABEL) => page.getByText(STATUS_LABEL[status], { exact: true })

test('F3: Pause takes it off Phoenix, and Resume puts it back', async () => {
  await tunde.goto(campaignPath)
  await expect(badge(tunde, 'live')).toBeVisible()

  await tunde.getByRole('button', { name: HOME.pause, exact: true }).click()
  await expectToast(tunde, CAMPAIGN.paused)
  await expect(badge(tunde, 'paused')).toBeVisible()
  await expect(tunde.getByText(CAMPAIGN_COPY.daily.paused)).toBeVisible()

  await tunde.getByRole('button', { name: HOME.resume, exact: true }).click()
  await expectToast(tunde, CAMPAIGN.resumed)
  await expect(badge(tunde, 'live')).toBeVisible()
  await expect(tunde.getByRole('button', { name: HOME.pause, exact: true })).toBeVisible()
})

test('F3: End campaign now asks first, then ends it and releases the unspent budget', async () => {
  await tunde.goto(campaignPath)
  await tunde.getByRole('button', { name: C.end }).click()
  const confirm = tunde.getByRole('dialog', { name: CAMPAIGN.endConfirm })
  await expect(confirm).toBeVisible()

  // Cancel changes nothing.
  await confirm.getByRole('button', { name: C.cancel }).click()
  await expect(confirm).toHaveCount(0)
  await expect(badge(tunde, 'live')).toBeVisible()

  await tunde.getByRole('button', { name: C.end }).click()
  await confirm.getByRole('button', { name: C.endConfirm, exact: true }).click()
  // Approved moments ago, it has delivered nothing: the whole budget goes back to Kola Bright's credit.
  await expectToast(tunde, CAMPAIGN.ended(FLASH.budgetUsd * 100))
  await expect(badge(tunde, 'ended')).toBeVisible()
  await expect(tunde.getByText(CAMPAIGN_COPY.daily.ended)).toBeVisible()
  // Ended: nothing to pause, resume or end, and Save is off.
  await expect(tunde.getByRole('button', { name: C.save })).toBeDisabled()
  await expect(tunde.getByRole('button', { name: C.end })).toHaveCount(0)
  await expect(tunde.getByRole('button', { name: HOME.pause, exact: true })).toHaveCount(0)
  await expect(tunde.getByRole('button', { name: HOME.resume, exact: true })).toHaveCount(0)
})
