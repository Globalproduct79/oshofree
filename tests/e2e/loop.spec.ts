import { expect, test } from '@playwright/test'
import { COPY } from '@/lib/copy'
import { STATUS_LABEL } from '@/lib/copy-components'
import { HOME } from '@/lib/copy-home'
import { NOTIFY } from '@/lib/copy-notifications'
import { CAMPAIGN_COPY } from '@/lib/copy-report'
import { REVIEW } from '@/lib/copy-review'
import { SHELL } from '@/lib/copy-shell'
import {
  ADMIN, approveCampaign, box, CAMPAIGN_PAGE, expectToast, metricValue, signIn, submitCampaign, type NewCampaign,
} from './helpers'

// The loop you can show: a brand signs up, Global approves it and its offer, a Phoenix user shares
// the offer from the wall, a friend claims it and asks for a link of their own, and the brand's
// campaign page counts every step. Runs against the seeded oshofree_test database (npm run test:e2e).

const BRAND = { name: 'Nkem Brand', email: 'new@brand.demo', password: 'password123' }
const WORKSPACE = 'Brand Demo'
const OFFER: NewCampaign = {
  name: 'E2E offer',
  headline: 'E2E: buy one get one',
  description: 'Show the code at the till.',
  budgetUsd: 100,
}
const SHARE_URL = /^http:\/\/localhost:3101\/o\/[0-9A-Z]{8}$/
const L = COPY.landing
const S = CAMPAIGN_COPY.sharingBox

test('the loop: sign up, approve, share from the wall, claim, and see it counted', async ({ browser }) => {
  const brandContext = await browser.newContext()
  const brand = await brandContext.newPage()
  const adminContext = await browser.newContext()
  const admin = await adminContext.newPage()

  await test.step('a new brand signs up and creates its workspace, which waits for Global', async () => {
    await brand.goto('/sign-up')
    await brand.getByLabel(COPY.auth.nameLabel, { exact: true }).fill(BRAND.name)
    await brand.getByLabel(COPY.auth.emailLabel).fill(BRAND.email)
    await brand.getByLabel(COPY.auth.passwordLabel).fill(BRAND.password)
    await brand.getByRole('button', { name: COPY.auth.signUpAction }).click()
    await brand.waitForURL('**/app/new-workspace')
    await brand.getByLabel(COPY.workspace.nameLabel).fill(WORKSPACE)
    await brand.getByLabel(COPY.workspace.typeLabel).selectOption('Brand')
    await brand.getByLabel(COPY.workspace.countryLabel).selectOption('NG')
    await brand.getByRole('button', { name: COPY.workspace.createAction }).click()
    await expect(brand.getByRole('status').filter({ hasText: SHELL.banner.pending.text })).toBeVisible()
  })

  await test.step('Global approves the new advertiser', async () => {
    await signIn(admin, ADMIN)
    await admin.goto('/admin/review')
    const advertisers = box(admin, REVIEW.advertisers.title)
    const row = advertisers
      .locator('div')
      .filter({ has: admin.getByText(WORKSPACE, { exact: true }) })
      .filter({ has: admin.getByRole('button', { name: REVIEW.advertisers.approve, exact: true }) })
      .last()
    await row.getByRole('button', { name: REVIEW.advertisers.approve, exact: true }).click()
    await expectToast(admin, REVIEW.toast.workspaceApproved(WORKSPACE))
    await expect(admin.getByText(WORKSPACE, { exact: true })).toHaveCount(0)
  })

  await test.step('the brand is told, its banner is gone, and it submits a campaign for review', async () => {
    await brand.goto('/app')
    await expect(brand.getByRole('status').filter({ hasText: SHELL.banner.pending.text })).toHaveCount(0)
    await brand.getByRole('button', { name: SHELL.bell.label }).click()
    await expect(brand.getByRole('region', { name: SHELL.bell.label }).getByText(NOTIFY.workspaceApproved().title)).toBeVisible()
    await submitCampaign(brand, OFFER)
    await expect(brand.getByText(STATUS_LABEL.review, { exact: true })).toBeVisible()
  })

  await test.step('Global approves the campaign', async () => {
    await approveCampaign(admin, OFFER.headline)
  })

  let sharedUrl = ''
  await test.step('a Phoenix user opens the offer on the wall and shares it', async () => {
    const wall = await adminContext.newPage() // the demo wall needs no sign-in; any browser stands in for Phoenix
    await wall.goto('/wall?country=NG')
    // The card's button takes no accessible name from its <article>, so find it by the headline inside.
    const card = wall.getByRole('button').filter({ has: wall.getByRole('heading', { name: OFFER.headline }) })
    await expect(card).toBeVisible()
    await card.click()
    await wall.getByRole('button', { name: COPY.wall.share, exact: true }).click()
    const link = wall.getByRole('textbox', { name: COPY.wall.shareLead })
    await expect(link).toHaveValue(SHARE_URL)
    sharedUrl = await link.inputValue()
  })

  await test.step('a friend opens the link, shows the code, gets a link of their own and shares it', async () => {
    const friendContext = await browser.newContext()
    const friend = await friendContext.newPage()
    await friend.goto(sharedUrl)
    await expect(friend.getByRole('heading', { name: OFFER.headline })).toBeVisible()
    await friend.getByRole('button', { name: L.showCode }).click()
    // The friend's own claim code (spec 6.7), not the campaign's.
    await expect(friend.getByText(/PHX-[0-9A-Z]{4}/)).toBeVisible()
    await friend.getByLabel(L.phoneLabel).fill('0803 123 4567')
    await friend.getByRole('button', { name: L.getLink }).click()
    const mine = friend.getByRole('textbox', { name: L.copyLabel })
    await expect(mine).toHaveValue(/\/o\/[0-9A-Z]{8}$/)
    const myUrl = await mine.inputValue()
    expect(myUrl).not.toBe(sharedUrl)
    // They pass it on: the WhatsApp button hands off to WhatsApp with their own link in the message. The
    // hand-off is followed only as far as WhatsApp's address, so the test never leaves this machine.
    const whatsapp = await friend.getByRole('link', { name: L.whatsapp, exact: true }).getAttribute('href')
    expect(whatsapp).toBeTruthy()
    const handOff = await friend.request.get(whatsapp!, { maxRedirects: 0 })
    expect(handOff.status()).toBeGreaterThanOrEqual(300)
    expect(handOff.status()).toBeLessThan(400)
    const location = handOff.headers()['location']
    expect(location).toBeDefined()
    const target = new URL(location)
    expect(target.host).toBe('wa.me')
    expect(target.searchParams.get('text')).toContain(myUrl)
    await friendContext.close()
  })

  await test.step("the brand's campaign page counts both shares, the friend's open and the friend's claim", async () => {
    await brand.goto('/app')
    await brand.getByRole('link', { name: HOME.open }).click()
    await brand.waitForURL(CAMPAIGN_PAGE)
    await expect(brand.getByRole('heading', { name: OFFER.headline })).toBeVisible()
    const sharing = box(brand, S.title)
    // A share counts once it goes out on a medium (spec §6.14.2): the wall's share and the friend's own WhatsApp.
    await expect(metricValue(brand, S.shares, sharing)).toHaveText('2')
    await expect(metricValue(brand, S.friendsOpened, sharing)).toHaveText('1')
    await expect(metricValue(brand, S.friendsClaimed, sharing)).toHaveText('1')
  })

  await test.step('an unknown link answers 410 Gone', async () => {
    const res = await brand.request.get('/o/NOPE0000')
    expect(res.status()).toBe(410)
  })

  await brandContext.close()
  await adminContext.close()
})
