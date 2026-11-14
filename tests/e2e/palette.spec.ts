import { expect, test, type Page } from '@playwright/test'
import { SHELL } from '@/lib/copy-shell'
import { ADMIN, BUY2, CAMPAIGN_PAGE, KOLA, signIn, TUNDE } from './helpers'

// ⌘K: the palette finds "Buy 2" and opens the campaign. In a workspace it searches that workspace; for Global it
// searches every campaign, and opening one enters its workspace.

const S = SHELL.search

async function search(page: Page, q: string) {
  const palette = page.getByRole('dialog', { name: S.label })
  // The shortcut is heard once the page has hydrated: press until the palette opens.
  await expect(async () => {
    await page.keyboard.press('ControlOrMeta+k')
    await expect(palette).toBeVisible({ timeout: 1000 })
  }).toPass()
  await palette.getByRole('searchbox', { name: S.label }).fill(q)
  return palette
}

test('⌘K finds Buy 2 in the workspace and Enter opens the campaign', async ({ page }) => {
  await signIn(page, TUNDE)
  const palette = await search(page, 'Buy 2')
  const campaigns = palette.getByRole('group', { name: S.groups.campaigns })
  await expect(campaigns.getByRole('button', { name: new RegExp(`^${BUY2.name}`) })).toBeVisible()
  await page.keyboard.press('Enter')
  await page.waitForURL(CAMPAIGN_PAGE)
  await expect(page.getByRole('heading', { name: BUY2.headline })).toBeVisible()
  await expect(palette).toHaveCount(0)
})

test('⌘K for Global finds Buy 2 across workspaces and opening it enters Kola Bright', async ({ page }) => {
  await signIn(page, ADMIN)
  const palette = await search(page, 'Buy 2')
  await palette
    .getByRole('group', { name: S.groups.campaigns })
    .getByRole('button', { name: new RegExp(`^${BUY2.name}`) })
    .click()
  await page.waitForURL(CAMPAIGN_PAGE)
  await expect(page.getByRole('heading', { name: BUY2.headline })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: SHELL.banner.globalInside.text(KOLA) })).toBeVisible()
})

test('Escape closes the palette, and a search with no match says so', async ({ page }) => {
  await signIn(page, TUNDE)
  const palette = await search(page, 'zzqx')
  await expect(palette.getByText(S.empty)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(palette).toHaveCount(0)
})
