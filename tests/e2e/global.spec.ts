import { expect, test } from '@playwright/test'
import { REVIEW } from '@/lib/copy-review'
import { SHELL } from '@/lib/copy-shell'
import { ADMIN, BUY2, expectInWorkspace, KOLA, signIn } from './helpers'

// Global enters a workspace from the switcher: the orange banner names it, and "Back to Platform" leaves it
// for Review. Nothing is changed.

const banner = SHELL.banner

test('Global switches into Kola Bright and back to Platform', async ({ page }) => {
  await signIn(page, ADMIN)
  await expect(page).toHaveURL(/\/admin\/review$/)
  await expect(page.getByRole('status').filter({ hasText: banner.global.text })).toBeVisible()

  await page.getByRole('button', { name: SHELL.switcher.button, exact: true }).click()
  const switcher = page.getByRole('region', { name: SHELL.switcher.title })
  await switcher.getByRole('button', { name: new RegExp(`^${KOLA}`) }).click()
  await page.waitForURL((url) => url.pathname === '/app')

  const inside = page.getByRole('status').filter({ hasText: banner.globalInside.text(KOLA) })
  await expect(inside).toBeVisible()
  await expect(inside.getByText(banner.globalInside.lead, { exact: true })).toBeVisible()
  await expectInWorkspace(page, KOLA)
  // Kola Bright's own campaigns.
  await expect(page.getByText(BUY2.headline).first()).toBeVisible()

  await inside.getByRole('button', { name: banner.back }).click()
  await page.waitForURL('**/admin/review')
  await expect(page.getByRole('heading', { name: REVIEW.title, exact: true })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: banner.global.text })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: banner.globalInside.text(KOLA) })).toHaveCount(0)
})
