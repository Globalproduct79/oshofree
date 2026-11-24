import { expect, type Locator, type Page } from '@playwright/test'
import { COPY } from '@/lib/copy'
import { CAMPAIGN_FORM_COPY as F } from '@/lib/copy-campaign-form'
import { REVIEW } from '@/lib/copy-review'
import { SHELL } from '@/lib/copy-shell'

// What the prototype's flows share: the seeded logins (prisma/seed/users.ts, every one with the same
// password), signing in, the toast, and a Kola Bright campaign taken from the form through Global's approval.
// The specs run against the seeded oshofree_test database (npm run test:e2e); each one that changes the
// seeded world makes its own campaign or puts things back.

export const PASSWORD = 'password'
export const ADMIN = 'admin@oshofree.demo'
export const TUNDE = 'tunde@kolabright.demo'
export const DOLAPO = 'dolapo@mediaspec.demo'

export const KOLA = 'Kola Bright'
export const MEDIASPEC = 'MediaSpec (agency)'
// Kola Bright's live seed campaign (prisma/seed/campaigns.ts): its name, and the headline its pages show.
export const BUY2 = { name: 'Buy 2 get 1 — November', headline: 'Buy 2 bottles, get 1 free' }

// Signs in and waits to land: an advertiser on /app, Global on /admin/review.
export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/sign-in')
  await page.getByLabel(COPY.auth.emailLabel).fill(email)
  await page.getByLabel(COPY.auth.passwordLabel).fill(password)
  await page.getByRole('button', { name: COPY.auth.signInAction }).click()
  await page.waitForURL((url) => url.pathname === '/app' || url.pathname.startsWith('/admin'))
  // The landing is a client-side navigation: wait for the shell to be drawn.
  await expect(page.getByRole('button', { name: SHELL.search.label, exact: true })).toBeVisible()
}

// The shell is drawn for this workspace: its name heads the sidebar (the topbar's name is the signed-in person).
export async function expectInWorkspace(page: Page, name: string) {
  await expect(page.locator('.side .brand b')).toContainText(name)
}

// The shell's toast (one at a time). Its text stays while it fades, so a fast assertion still finds it.
export async function expectToast(page: Page, text: string) {
  await expect(page.getByRole('status').filter({ hasText: text })).toBeVisible()
}

// A box on the page: the white panel headed by `title`.
export const box = (page: Page, title: string): Locator =>
  page.locator('.box').filter({ has: page.getByRole('heading', { name: title, exact: true }) })

// A KPI tile's value: the tile titled `title` (inside `scope`, the whole page by default), then its big number.
export function metricValue(page: Page, title: string, scope: Page | Locator = page): Locator {
  return scope.locator('.mc').filter({ has: page.getByText(title, { exact: true }) }).locator('.v')
}

// "$1,234" → 1234.
export const dollars = (text: string | null): number => Number((text ?? '').replace(/[^0-9.-]/g, ''))

// A Review queue row: the innermost block holding both the headline and an Approve button.
export function queueRow(page: Page, headline: string): Locator {
  return box(page, REVIEW.queue.title)
    .locator('div')
    .filter({ has: page.getByText(headline, { exact: true }) })
    .filter({ has: page.getByRole('button', { name: REVIEW.queue.approve, exact: true }) })
    .last()
}

// A card on Campaigns home, found by its headline. The hero is not a card, so callers pick a filter
// pill first (the hero is on All only).
export const homeCard = (page: Page, headline: string): Locator => page.getByRole('link').filter({ hasText: headline })

// A campaign's page, not the New campaign form.
export const CAMPAIGN_PAGE = /\/app\/campaigns\/(?!new$)[^/]+$/

// Today in Lagos, as the form's date field takes it: a campaign that starts today is live the moment Global approves it.
export const todayInLagos = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date())

// `rewardLocal` is typed over the form's default share reward when given.
export type NewCampaign = { name: string; headline: string; description: string; budgetUsd: number; rewardLocal?: number }

// Fills the New campaign form for a brand workspace (the brand is the workspace's): a Wall card, redeemed
// with a claim code, starting today, then reviews and submits it. `creative` runs once the placement is chosen (F1
// attaches an image there); `review` runs on the Review step before the confirmation (F1 checks the summary there).
// Returns the campaign page's path.
export async function submitCampaign(
  page: Page, c: NewCampaign, creative?: (page: Page) => Promise<void>, review?: (page: Page) => Promise<void>,
): Promise<string> {
  const L = F.fields
  await page.goto('/app/campaigns/new')
  await expect(page.getByRole('heading', { name: F.head.new.title })).toBeVisible()
  await expect(page.getByText(F.oneOffer, { exact: true })).toBeVisible()
  // The hint names the first rule that fails; the way to the Review step waits for none.
  await expect(page.locator('#cf-hint')).toHaveText(F.validation.name)
  await expect(page.getByRole('button', { name: F.buttons.review })).toBeDisabled()
  await page.getByLabel(L.name.label).fill(c.name)
  await page.getByLabel(L.headline.label).fill(c.headline)
  await page.getByLabel(L.description.label).fill(c.description)
  await page.getByRole('button', { name: new RegExp(`^${F.placements.card.name}`) }).click()
  await creative?.(page)
  await page.getByLabel(L.redeem.label).selectOption('code')
  await page.getByLabel(L.budget.label).fill(String(c.budgetUsd))
  if (c.rewardLocal !== undefined) await page.getByLabel(L.reward.label).fill(String(c.rewardLocal))
  await page.getByLabel(L.startsAt.label).fill(todayInLagos())
  // The confirmation is given on the Review step, not here.
  await expect(page.getByRole('checkbox', { name: L.terms })).toHaveCount(0)
  await openReview(page, c)
  await review?.(page)
  // Submit waits for the confirmation, and says so.
  const submit = page.getByRole('button', { name: F.buttons.submit })
  await expect(submit).toBeDisabled()
  await expect(page.locator('#cf-hint')).toHaveText(F.validation.terms)
  await page.getByRole('checkbox', { name: L.terms }).check()
  await expect(submit).toBeEnabled()
  await submit.click()
  // The form lands on the new campaign's page.
  await page.waitForURL(CAMPAIGN_PAGE)
  await expectToast(page, F.toasts.submitted)
  return new URL(page.url()).pathname
}

// "Review before submitting": the Review step opens with the focus on its heading, summarising what was filled in.
export async function openReview(page: Page, c: Pick<NewCampaign, 'headline'>) {
  const review = page.getByRole('button', { name: F.buttons.review })
  await expect(review).toBeEnabled()
  await review.click()
  await expect(page.getByRole('heading', { name: F.review.title })).toBeFocused()
  await expect(box(page, F.review.title).getByText(c.headline, { exact: true })).toBeVisible()
}

// A value on the Review step, by its label (the label's line also holds its Edit).
export const reviewValue = (page: Page, label: string): Locator =>
  box(page, F.review.title)
    .locator('.kv > div')
    .filter({ has: page.locator('small', { hasText: new RegExp(`^${label.replace(/[()]/g, '\\$&')}`) }) })
    .locator('b')

// Global approves a campaign from Review's queue; the row leaves it.
export async function approveCampaign(admin: Page, headline: string) {
  await admin.goto('/admin/review')
  const row = queueRow(admin, headline)
  await row.getByRole('button', { name: REVIEW.queue.approve, exact: true }).click()
  await expectToast(admin, REVIEW.toast.approved)
  await expect(box(admin, REVIEW.queue.title).getByText(headline, { exact: true })).toHaveCount(0)
}
