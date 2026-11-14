import { expect, test, type Locator, type Page } from '@playwright/test'

// The loop you can show: a brand signs up, Global approves it and its offer, a Phoenix user shares
// the offer from the wall, a friend claims it and asks for a link of their own, and the brand's
// report counts every step. Runs against the seeded oshofree_test database (npm run test:e2e).

const BRAND = { name: 'Nkem Brand', email: 'new@brand.demo', password: 'password123' }
const ADMIN = { email: 'admin@oshofree.demo', password: 'password' }
const HEADLINE = 'E2E: buy one get one'
const SHARE_URL = /^http:\/\/localhost:3101\/o\/[0-9A-Z]{8}$/

async function signIn(page: Page, who: { email: string; password: string }) {
  await page.goto('/sign-in')
  await page.getByLabel('Work email').fill(who.email)
  await page.getByLabel('Password').fill(who.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((url) => url.pathname.startsWith('/app'))
}

// Approve one row of a review queue, then wait for it to leave the queue.
async function approve(page: Page, queue: string, rowName: string) {
  const section = page.locator('section').filter({ has: page.getByRole('heading', { name: queue }) })
  const name = page.getByText(rowName, { exact: true })
  // The innermost block holding both the row's name and its Approve button.
  const row = section
    .locator('div')
    .filter({ has: name })
    .filter({ has: page.getByRole('button', { name: 'Approve' }) })
    .last()
  await row.getByRole('button', { name: 'Approve' }).click()
  await expect(section.getByText(rowName, { exact: true })).toHaveCount(0)
}

// A number tile is its label, then its value.
const tileValue = (scope: Locator, label: string) =>
  scope.locator('p').filter({ hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::p[1]')

// A funnel row is its label (and hint), then its value.
const funnelValue = (page: Page, label: string) =>
  page.getByRole('listitem').filter({ has: page.getByText(label, { exact: true }) }).locator(':scope > p')

test('the loop: sign up, approve, share from the wall, claim, and see it counted', async ({ browser }) => {
  const brandContext = await browser.newContext()
  const brand = await brandContext.newPage()
  const adminContext = await browser.newContext()
  const admin = await adminContext.newPage()

  await test.step('a new brand signs up and creates its workspace, which waits for Global', async () => {
    await brand.goto('/sign-up')
    await brand.getByLabel('Name').fill(BRAND.name)
    await brand.getByLabel('Work email').fill(BRAND.email)
    await brand.getByLabel('Password').fill(BRAND.password)
    await brand.getByRole('button', { name: 'Create account' }).click()
    await brand.waitForURL('**/app/new-workspace')
    await brand.getByLabel('Workspace name').fill('Brand Demo')
    await brand.getByLabel('Type').selectOption('Brand')
    await brand.getByLabel('Billing country').selectOption('NG')
    await brand.getByRole('button', { name: 'Create workspace' }).click()
    await expect(brand.getByText('Global checks new advertisers within one working day')).toBeVisible()
  })

  await test.step('Global approves the new advertiser', async () => {
    await signIn(admin, ADMIN)
    await admin.goto('/admin/review')
    await approve(admin, 'New advertisers', 'Brand Demo')
  })

  await test.step('the brand submits a campaign for review', async () => {
    await brand.goto('/app/campaigns/new')
    // The one-page form (ADV §3): the brand is the workspace's, the country and category default.
    await expect(brand.getByText('Give the campaign a name.')).toBeVisible()
    await brand.getByLabel('Campaign name').fill('E2E offer')
    await brand.getByLabel('Offer headline').fill(HEADLINE)
    await brand.getByLabel('What the consumer gets and how').fill('Show the code at the till.')
    await brand.getByLabel('How consumers redeem').selectOption('code')
    await brand.getByLabel('Budget (USD)').fill('100')
    // Today in Lagos: the campaign starts at the market's midnight, so it is live the moment it is approved.
    await brand.getByLabel('Start date').fill(new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date()))
    await brand.getByRole('checkbox', { name: /This offer is genuine/ }).check()
    await brand.getByRole('button', { name: 'Submit for review' }).click()
    await brand.waitForURL(/\/app\/campaigns\/[^/]+$/)
  })

  await test.step('Global approves the campaign', async () => {
    await admin.goto('/admin/review')
    await approve(admin, 'Campaigns waiting', 'E2E offer')
  })

  let sharedUrl = ''
  await test.step('a Phoenix user opens the offer on the wall and shares it', async () => {
    const wall = await adminContext.newPage() // the demo wall needs no sign-in; any browser stands in for Phoenix
    await wall.goto('/wall?country=NG')
    // The card's button takes no accessible name from its <article>, so find it by the headline inside.
    const card = wall.getByRole('button').filter({ has: wall.getByRole('heading', { name: HEADLINE }) })
    await expect(card).toBeVisible()
    await card.click()
    await wall.getByRole('button', { name: 'Share', exact: true }).click()
    const link = wall.getByRole('textbox', { name: 'Send this link to a friend' })
    await expect(link).toHaveValue(SHARE_URL)
    sharedUrl = await link.inputValue()
  })

  await test.step('a friend opens the link, shows the code and gets a link of their own', async () => {
    const friendContext = await browser.newContext()
    const friend = await friendContext.newPage()
    await friend.goto(sharedUrl)
    await expect(friend.getByRole('heading', { name: HEADLINE })).toBeVisible()
    await friend.getByRole('button', { name: 'Show my code' }).click()
    await expect(friend.getByText('E2E123')).toBeVisible()
    await friend.getByLabel('Mobile number').fill('0803 123 4567')
    await friend.getByRole('button', { name: 'Get my link' }).click()
    const mine = friend.getByRole('textbox', { name: 'Or copy your link' })
    await expect(mine).toHaveValue(/\/o\/[0-9A-Z]{8}$/)
    expect(await mine.inputValue()).not.toBe(sharedUrl)
    await friendContext.close()
  })

  await test.step("the brand's campaign page counts the shares, the open, the claim and the details", async () => {
    await brand.goto('/app')
    await brand.getByRole('link', { name: 'Open campaign' }).click()
    await brand.waitForURL(/\/app\/campaigns\/[^/]+$/)
    const sharing = brand.locator('section').filter({ has: brand.getByRole('heading', { name: 'Sharing', exact: true }) })
    // Shares count Channel and Consumer links (spec 6.9): the wall's share and the friend's own link.
    await expect(tileValue(sharing, 'Shares')).toHaveText('2')
    await expect(funnelValue(brand, 'Friend opened via link')).toHaveText('1')
    await expect(funnelValue(brand, 'Friend claimed via link')).toHaveText('1')
    await expect(tileValue(sharing, 'Details left')).toHaveText('1')
  })

  await test.step('an unknown link answers 410 Gone', async () => {
    const res = await brand.request.get('/o/NOPE0000')
    expect(res.status()).toBe(410)
  })

  await brandContext.close()
  await adminContext.close()
})
