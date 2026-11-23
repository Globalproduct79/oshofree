import { expect, test, type Page } from '@playwright/test'
import { ADVERTISERS } from '@/lib/copy-advertisers'
import { CAMPAIGN } from '@/lib/copy-campaign'
import { STATUS_LABEL } from '@/lib/copy-components'
import { DEMO } from '@/lib/copy-demo'
import { HOME } from '@/lib/copy-home'
import { MONEY } from '@/lib/copy-money'
import { NOTIFY } from '@/lib/copy-notifications'
import { SHELL } from '@/lib/copy-shell'
import {
  ADMIN, BUY2, DOLAPO, dollars, expectToast, homeCard, KOLA, MEDIASPEC, metricValue, signIn, TUNDE,
} from './helpers'

// F4, credit and paying. Global lowers Kola Bright's limit below what it has in use and runs the daily job:
// Buy 2 get 1 pauses and Tunde is told; Resume is refused until Global raises the limit again (Kola Bright
// has no open invoice to pay). Then Global marks MediaSpec's open invoice paid and Dolapo's credit in use
// drops by it. Kola Bright's limit goes back to the seeded $1,500 however the spec ends.

const D = ADVERTISERS.detail
const B = MONEY.billing
const SEEDED_LIMIT = 1500
const INVOICE = 'INV-0044'

test.describe.configure({ mode: 'serial' })

let admin: Page
let tunde: Page

test.beforeAll(async ({ browser }) => {
  admin = await (await browser.newContext()).newPage()
  tunde = await (await browser.newContext()).newPage()
  await signIn(admin, ADMIN)
  await signIn(tunde, TUNDE)
})

test.afterAll(async () => {
  // Put the seeded limit back even when a step failed half-way; a failed restore fails the spec.
  try {
    if (admin) await setLimit(KOLA, SEEDED_LIMIT)
  } finally {
    await admin?.context().close()
    await tunde?.context().close()
  }
})

// Global opens the workspace's page from Platform › Advertisers.
async function openAdvertiser(name: string) {
  await admin.goto('/admin/advertisers')
  await admin.getByRole('link', { name, exact: true }).click()
  await expect(admin.getByRole('heading', { name, exact: true })).toBeVisible()
}

// The credit limit field saves on Enter, says so, and redraws with the new limit.
async function setLimit(name: string, limit: number) {
  await openAdvertiser(name)
  const field = admin.getByLabel(D.creditLimit, { exact: true })
  if ((await field.inputValue()) === String(limit)) return
  await field.fill(String(limit))
  await field.press('Enter')
  await expectToast(admin, ADVERTISERS.creditToast)
  await expect(admin.getByLabel(D.creditLimit, { exact: true })).toHaveValue(String(limit))
}

async function openBuy2(page: Page) {
  await page.goto('/app?filter=paused')
  await homeCard(page, BUY2.headline).click()
  await expect(page.getByRole('heading', { name: BUY2.headline })).toBeVisible()
}

test("F4: Global lowers Kola Bright's limit to $100 and runs the daily job", async () => {
  await setLimit(KOLA, 100)

  await admin.goto('/admin/review')
  await admin.getByRole('button', { name: DEMO.runDaily }).click()
  await expectToast(admin, DEMO.ranDaily)
})

test('F4: Tunde sees it paused, is told why, and cannot resume over the limit', async () => {
  await tunde.goto('/app')
  await tunde.getByRole('button', { name: new RegExp(`^${HOME.pills.paused}`) }).click()
  await expect(homeCard(tunde, BUY2.headline).getByText(STATUS_LABEL.paused, { exact: true })).toBeVisible()

  await tunde.getByRole('button', { name: SHELL.bell.label }).click()
  const told = NOTIFY.pausedOverCredit(BUY2.name)
  await expect(tunde.getByRole('region', { name: SHELL.bell.label }).getByText(told.title)).toBeVisible()

  await tunde.goto('/app/billing')
  await expect(metricValue(tunde, B.limitTitle)).toHaveText('$100')
  await expect(metricValue(tunde, B.availableTitle)).toHaveText('$0')
  await expect(tunde.getByText(B.nearLimitSub)).toBeVisible()
  await expect(tunde.getByText(MONEY.limitReached)).toBeVisible()

  await openBuy2(tunde)
  await tunde.getByRole('button', { name: HOME.resume, exact: true }).click()
  await expectToast(tunde, MONEY.cantResume)
  await expect(tunde.getByRole('button', { name: HOME.resume, exact: true })).toBeVisible()
})

test('F4: Global raises the limit back to $1,500 and Resume works', async () => {
  await setLimit(KOLA, SEEDED_LIMIT)

  await openBuy2(tunde)
  await tunde.getByRole('button', { name: HOME.resume, exact: true }).click()
  await expectToast(tunde, CAMPAIGN.resumed)
  await expect(tunde.getByRole('button', { name: HOME.pause, exact: true })).toBeVisible()

  await tunde.goto('/app/billing')
  await expect(metricValue(tunde, B.limitTitle)).toHaveText('$1,500')
  await expect(tunde.getByText(MONEY.limitReached)).toHaveCount(0)
})

test("F4: Global marks MediaSpec's open invoice paid and Dolapo's credit in use drops by it", async ({ browser }) => {
  const dolapo = await (await browser.newContext()).newPage()
  await signIn(dolapo, DOLAPO)
  await dolapo.goto('/app/billing')
  const before = dollars(await metricValue(dolapo, B.inUseTitle).textContent())

  await openAdvertiser(MEDIASPEC)
  const row = admin.getByRole('row').filter({ hasText: INVOICE })
  // Unpaid: Due until the 15th (the 1st's close plus 14 days' terms), Overdue from the 16th — either takes Mark paid.
  await expect(row.getByText(new RegExp(`^(${STATUS_LABEL.due}|${STATUS_LABEL.overdue})$`))).toBeVisible()
  // The invoice's columns: number, period, status, due, USD, local, action.
  const amount = dollars(await row.getByRole('cell').nth(4).textContent())
  // Large enough that a drop of nothing cannot pass for it.
  expect(amount).toBeGreaterThanOrEqual(5)
  await row.getByRole('button', { name: D.markPaid }).click()
  await expectToast(admin, D.paid(INVOICE))
  await expect(row.getByText(STATUS_LABEL.paid, { exact: true })).toBeVisible()
  await expect(row.getByRole('button', { name: D.markPaid })).toHaveCount(0)

  await dolapo.reload()
  await expect(dolapo.getByText(MONEY.paidLine(INVOICE))).toBeVisible()
  const after = dollars(await metricValue(dolapo, B.inUseTitle).textContent())
  // Both pages print to the cent (whole dollars whole), so in use drops by exactly the invoice.
  expect(after).toBeCloseTo(before - amount, 2)
  await dolapo.context().close()
})
