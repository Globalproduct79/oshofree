import path from 'node:path'
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { rewardLabel } from '@/lib/campaign-schema'
import { COPY } from '@/lib/copy'
import { ACTIVITY, SHARERS } from '@/lib/copy-activity'
import { CAMPAIGN_FORM_COPY as F } from '@/lib/copy-campaign-form'
import { COMPONENTS, STATUS_LABEL } from '@/lib/copy-components'
import { HOME } from '@/lib/copy-home'
import { NOTIFY } from '@/lib/copy-notifications'
import { ORGANISATION } from '@/lib/copy-organisation'
import { INVITE_PAGE, PEOPLE } from '@/lib/copy-people'
import { CAMPAIGN_COPY, PREVIEW_COPY as P } from '@/lib/copy-report'
import { REVIEW } from '@/lib/copy-review'
import { REWARDS_LEDGER } from '@/lib/copy-rewards-ledger'
import { SHARING } from '@/lib/copy-sharing'
import { SHELL } from '@/lib/copy-shell'
import { localAmount, maskPhone } from '@/lib/format'
import {
  ADMIN, approveCampaign, box, CAMPAIGN_PAGE, expectToast, metricValue, openReview, signIn, todayInLagos, type NewCampaign,
} from './helpers'

// Prompt 10: the product as three people use it, end to end, each step checked by what the person sees.
//  1. Owner: signs up, creates the workspace, waits under the pending banner until Global approves it, finds it live,
//     opens Organisation, invites a Manager and copies the link.
//  2. Member: opens that link in a browser of their own, creates an account, lands in the workspace, has New campaign
//     but not Invite user, and finds themselves in Organisation's Team.
//  3. Advertiser (that Manager): makes an offer with the seed's JPG, previews it as the Wall card and its landing page,
//     reviews and submits it; Global approves it and it goes live; Phoenix finds it on /api/v1/offers, reports an
//     impression and an open, takes a claim code and shares it; a friend opens the shared page and claims; Sharing shows
//     the friend under the sharer, Recent activity the whole chain, and Global's Rewards ledger the reward owed.
// The journeys build on each other (the member joins through the owner's link; the advertiser is that member), so the
// file runs in order and stops at the first failure. Run them alone with `npm run test:e2e -- journeys` (README, Tests).

test.describe.configure({ mode: 'serial' })

const WORKSPACE = 'Lagoon Drinks'
const PASSWORD = 'password123'
const OWNER = { name: 'Temi Bakare', email: 'temi@lagoondrinks.demo' }
const MEMBER = { name: 'Kunle Ade', email: 'kunle@lagoondrinks.demo' }
const OFFER: NewCampaign = {
  name: 'Lagoon launch',
  headline: 'Lagoon Drinks: a free can with every 6-pack',
  description: 'Show your claim code at any Lagoon Drinks stockist for a free 33cl can with a 6-pack.',
  budgetUsd: 150,
}
// Phoenix's sharer: an OTP-verified Nigerian number, as Phoenix sends it on POST /share.
const SHARER_MSISDN = '+2348035550101'
const SHARER = maskPhone(SHARER_MSISDN)
const SESSION = 'phx-session-journeys-0001'
const KEY = process.env.DEMO_CHANNEL_KEY ?? 'phx_dev_oshofree'
const METRO = path.join('prisma', 'seed', 'creatives', 'metro.jpg')
const STORED_JPG = /^\/uploads\/[0-9a-f-]{36}\.jpg$/
const coverOf = (url: string) => new RegExp(`background-image:\\s*url\\("${url}"\\)`)
const REWARD = rewardLabel('NG', 50)
// "₦50": the campaign's reward per share, as the Sharing, activity and ledger lines print it.
const REWARD_AMOUNT = localAmount(50, 'NG')
const L = COPY.landing

const pendingBanner = (page: Page) => page.getByRole('status').filter({ hasText: SHELL.banner.pending.text })
const sideLink = (page: Page, name: string) => page.locator('.side').getByRole('link', { name, exact: true })
const inviteUser = (page: Page) => page.getByRole('link', { name: PEOPLE.inviteUser, exact: true })
const inWorkspace = (page: Page) => expect(page.getByRole('button', { name: SHELL.switcher.label(WORKSPACE) })).toBeVisible()

// What the journeys hand on: the owner's invite link, the member's browser, the campaign's page and Phoenix's link.
const shared = { link: '', campaignPath: '', image: '', shareUrl: '' }
let browserRef: Browser
const contexts: BrowserContext[] = []
let owner: Page
let admin: Page
let member: Page

async function newPage(browser: Browser, options?: Parameters<Browser['newContext']>[0]): Promise<Page> {
  const context = await browser.newContext(options)
  contexts.push(context)
  return context.newPage()
}

test.beforeAll(async ({ browser }) => {
  browserRef = browser
  // The owner copies the invite link, so their browser may use the clipboard.
  owner = await newPage(browser, { permissions: ['clipboard-read', 'clipboard-write'] })
  admin = await newPage(browser)
})

test.afterAll(async () => {
  for (const c of contexts) await c.close()
})

test('Owner: signs up, is approved, and invites a Manager from Organisation', async () => {
  test.setTimeout(240_000)

  await test.step('signs up and lands on New workspace', async () => {
    await owner.goto('/sign-up')
    await expect(owner.getByText(COPY.auth.signUpTitle).first()).toBeVisible()
    await owner.getByLabel(COPY.auth.nameLabel, { exact: true }).fill(OWNER.name)
    await owner.getByLabel(COPY.auth.emailLabel).fill(OWNER.email)
    await owner.getByLabel(COPY.auth.passwordLabel).fill(PASSWORD)
    await owner.getByRole('button', { name: COPY.auth.signUpAction }).click()
    await owner.waitForURL('**/app/new-workspace')
    await expect(owner.getByRole('heading', { name: COPY.workspace.newTitle })).toBeVisible()
  })

  await test.step('creates the workspace; its home waits under the awaiting-approval banner', async () => {
    await owner.getByLabel(COPY.workspace.nameLabel).fill(WORKSPACE)
    await owner.getByLabel(COPY.workspace.typeLabel).selectOption('Brand')
    await owner.getByLabel(COPY.workspace.countryLabel).selectOption('NG')
    await owner.getByRole('button', { name: COPY.workspace.createAction }).click()
    await owner.waitForURL((url) => url.pathname === '/app')
    await inWorkspace(owner)
    await expect(pendingBanner(owner)).toBeVisible()
    // Greeted by name, with nothing on Phoenix yet.
    await expect(owner.getByRole('heading', { level: 1, name: new RegExp(`, ${OWNER.name.split(' ')[0]}$`) })).toBeVisible()
    await expect(owner.getByText(HOME.empty.title)).toBeVisible()
  })

  await test.step('Global approves the workspace on Review', async () => {
    await signIn(admin, ADMIN)
    await admin.goto('/admin/review')
    const row = box(admin, REVIEW.advertisers.title)
      .locator('div')
      .filter({ has: admin.getByText(WORKSPACE, { exact: true }) })
      .filter({ has: admin.getByRole('button', { name: REVIEW.advertisers.approve, exact: true }) })
      .last()
    await row.getByRole('button', { name: REVIEW.advertisers.approve, exact: true }).click()
    await expectToast(admin, REVIEW.toast.workspaceApproved(WORKSPACE))
    await expect(box(admin, REVIEW.advertisers.title).getByText(WORKSPACE, { exact: true })).toHaveCount(0)
  })

  await test.step('the home is live: the banner is gone and the bell says the workspace was approved', async () => {
    await owner.reload()
    await inWorkspace(owner)
    await expect(pendingBanner(owner)).toHaveCount(0)
    await owner.getByRole('button', { name: SHELL.bell.label }).click()
    await expect(owner.getByRole('region', { name: SHELL.bell.label }).getByText(NOTIFY.workspaceApproved().title)).toBeVisible()
    await owner.keyboard.press('Escape')
  })

  await test.step('Organisation shows the company approved and the owner alone in the team', async () => {
    await sideLink(owner, SHELL.nav.overview).click()
    await owner.waitForURL((url) => url.pathname === '/app/organisation')
    await expect(owner.getByRole('heading', { name: ORGANISATION.title, exact: true })).toBeVisible()
    await expect(box(owner, ORGANISATION.company.title).getByText(COPY.status.approved, { exact: true })).toBeVisible()
    const team = box(owner, ORGANISATION.team.title).getByRole('listitem')
    await expect(team).toHaveCount(1)
    await expect(team.first()).toContainText(OWNER.email)
    await expect(box(owner, ORGANISATION.pending.title).getByText(ORGANISATION.pending.empty)).toBeVisible()
  })

  await test.step('invites a Manager: the invite page shows the pending invitation and its link', async () => {
    await inviteUser(owner).click()
    await owner.waitForURL('**/app/people/invite')
    const form = box(owner, PEOPLE.invite)
    await form.getByLabel(PEOPLE.emailLabel).fill(MEMBER.email)
    await form.getByLabel(PEOPLE.roleLabel).selectOption('Manager')
    await form.getByRole('button', { name: PEOPLE.sendInvite }).click()
    await expectToast(owner, PEOPLE.inviteSent)
    const pending = box(owner, PEOPLE.invitePage.pendingTitle)
    await expect(pending.getByText(PEOPLE.invitePage.sent(MEMBER.email))).toBeVisible()
    const field = pending.getByLabel(PEOPLE.linkLabel, { exact: true })
    await expect(field).toHaveValue(/\/invite\/\S+$/)
    shared.link = await field.inputValue()
  })

  await test.step('copies the link: the toast says so and the clipboard holds it', async () => {
    await box(owner, PEOPLE.invitePage.pendingTitle).getByRole('button', { name: PEOPLE.copy, exact: true }).click()
    await expectToast(owner, PEOPLE.linkCopied)
    expect(await owner.evaluate(() => navigator.clipboard.readText())).toBe(shared.link)
  })

  await test.step("Organisation lists the invitation as pending", async () => {
    await owner.getByRole('link', { name: PEOPLE.invitePage.back }).click()
    await owner.waitForURL((url) => url.pathname === '/app/organisation')
    await expect(box(owner, ORGANISATION.pending.title).getByText(MEMBER.email)).toBeVisible()
  })
})

test('Member: opens the link, creates an account and lands in the workspace as a Manager', async () => {
  test.setTimeout(180_000)
  expect(shared.link, 'the owner journey hands on an invite link').not.toBe('')
  // A browser of their own: nobody is signed in there.
  member = await newPage(browserRef)

  await test.step('the link says who invited them, to what, as what', async () => {
    await member.goto(shared.link)
    await expect(member.getByText(INVITE_PAGE.headline(OWNER.name, WORKSPACE, 'Manager'))).toBeVisible()
  })

  await test.step('creates an account from it and lands in the workspace, told so', async () => {
    await member.getByRole('link', { name: INVITE_PAGE.createAccount }).click()
    await member.waitForURL('**/sign-up?invite=*')
    await expect(member.getByText(INVITE_PAGE.joining(WORKSPACE, 'Manager'), { exact: true })).toBeVisible()
    await expect(member.getByLabel(COPY.auth.emailLabel)).toHaveValue(MEMBER.email)
    await member.getByLabel(COPY.auth.nameLabel, { exact: true }).fill(MEMBER.name)
    await member.getByLabel(COPY.auth.passwordLabel).fill(PASSWORD)
    await member.getByRole('button', { name: COPY.auth.signUpAction }).click()
    await member.waitForURL((url) => url.pathname === '/app')
    await expectToast(member, INVITE_PAGE.joined(WORKSPACE, 'Manager'))
    await inWorkspace(member)
    await expect(pendingBanner(member)).toHaveCount(0)
  })

  await test.step('has New campaign, in the sidebar and the head', async () => {
    await expect(sideLink(member, SHELL.nav.newCampaign)).toBeVisible()
    await expect(member.locator('.head').getByRole('link', { name: HOME.newCampaign, exact: true })).toBeVisible()
  })

  await test.step('opens Organisation: no Invite user, and they are in the Team, marked as them', async () => {
    await sideLink(member, SHELL.nav.overview).click()
    await member.waitForURL((url) => url.pathname === '/app/organisation')
    await expect(member.getByRole('heading', { name: ORGANISATION.title, exact: true })).toBeVisible()
    await expect(inviteUser(member)).toHaveCount(0)
    const me = box(member, ORGANISATION.team.title).getByRole('listitem').filter({ hasText: MEMBER.email })
    await expect(me).toContainText(MEMBER.name)
    await expect(me.getByText(PEOPLE.you, { exact: true })).toBeVisible()
    await expect(me.getByText('Manager', { exact: true })).toBeVisible()
    // The owner is in the team too, and the invitation is no longer pending.
    await expect(box(member, ORGANISATION.team.title).getByRole('listitem').filter({ hasText: OWNER.email })).toHaveCount(1)
    await expect(box(member, ORGANISATION.pending.title).getByText(ORGANISATION.pending.empty)).toBeVisible()
  })
})

test('Advertiser: the Manager publishes an offer, Phoenix shares it, a friend claims, and every page shows it', async () => {
  test.setTimeout(300_000)
  expect(member, 'the member journey signs the Manager in').toBeDefined()
  const L2 = F.fields

  await test.step('New campaign: the offer is filled in and the seed JPG uploaded; the card preview takes it', async () => {
    await sideLink(member, SHELL.nav.newCampaign).click()
    await member.waitForURL('**/app/campaigns/new')
    await expect(member.getByRole('heading', { name: F.head.new.title })).toBeVisible()
    await member.getByLabel(L2.name.label).fill(OFFER.name)
    await member.getByLabel(L2.headline.label).fill(OFFER.headline)
    await member.getByLabel(L2.description.label).fill(OFFER.description)
    await member.getByRole('button', { name: new RegExp(`^${F.placements.card.name}`) }).click()
    await member.getByLabel(F.drop.card.label).setInputFiles(METRO)
    const thumb = member.getByRole('img', { name: COMPONENTS.drop.chosen.image })
    await expect(thumb).toHaveAttribute('src', STORED_JPG)
    shared.image = (await thumb.getAttribute('src'))!
    await expect(member.getByText(F.upload.attached.image, { exact: true })).toBeVisible()
    await expect(box(member, F.previewBox.title).locator('.cv')).toHaveAttribute('style', coverOf(shared.image))
    await member.getByLabel(L2.redeem.label).selectOption('code')
    await member.getByLabel(L2.budget.label).fill(String(OFFER.budgetUsd))
    await member.getByLabel(L2.startsAt.label).fill(todayInLagos())
  })

  await test.step('the preview shows the Wall card with the image, and the landing page with the offer', async () => {
    await member.getByRole('button', { name: F.buttons.preview }).click()
    const dialog = member.getByRole('dialog', { name: P.title })
    await expect(dialog.getByRole('tab', { name: F.placements.card.name, exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(dialog.locator('.pc.mine .tl')).toHaveAttribute('style', coverOf(shared.image))
    await dialog.getByRole('tab', { name: P.tabs.landing }).click()
    const landing = dialog.frameLocator(`iframe[title="${P.landingFrame}"]`)
    await expect(landing.getByRole('heading', { name: OFFER.headline })).toBeVisible()
    await expect(landing.getByText(REWARD, { exact: true }).first()).toBeVisible()
    await expect(landing.locator('img.art')).toHaveAttribute('src', shared.image)
    await dialog.getByRole('button', { name: P.close }).click()
    await expect(dialog).toHaveCount(0)
  })

  await test.step('the Review step sums it up; Submit sends it to Global and lands on the campaign, in review', async () => {
    await openReview(member, OFFER)
    await expect(member.getByRole('img', { name: F.review.image })).toHaveAttribute('src', shared.image)
    await member.getByRole('checkbox', { name: L2.terms }).check()
    await member.getByRole('button', { name: F.buttons.submit }).click()
    await member.waitForURL(CAMPAIGN_PAGE)
    await expectToast(member, F.toasts.submitted)
    shared.campaignPath = new URL(member.url()).pathname
    await expect(member.getByRole('heading', { name: OFFER.headline })).toBeVisible()
    await expect(member.getByText(STATUS_LABEL.review, { exact: true })).toBeVisible()
  })

  await test.step('Global approves it; the campaign page says Live', async () => {
    await approveCampaign(admin, OFFER.headline)
    await member.reload()
    await expect(member.getByText(STATUS_LABEL.live, { exact: true })).toBeVisible()
    await expect(member.getByRole('button', { name: HOME.pause, exact: true })).toBeVisible()
  })

  const offerId = () => shared.campaignPath.split('/').pop()!
  const api = (method: 'get' | 'post', url: string, data?: unknown, headers: Record<string, string> = {}) =>
    member.request[method](url, { headers: { Authorization: `Bearer ${KEY}`, ...headers }, data })

  await test.step('Phoenix finds the offer on /api/v1/offers, with the uploaded image', async () => {
    const res = await api('get', '/api/v1/offers?country=NG')
    expect(res.status()).toBe(200)
    const offer = (await res.json()).offers.find((o: { id: string }) => o.id === offerId())
    expect(offer).toMatchObject({ headline: OFFER.headline, placement: 'card' })
    expect(new URL(offer.creative.image).pathname).toBe(shared.image)
  })

  await test.step('Phoenix reports an impression and an open, takes a claim code and reports the claim', async () => {
    const ts = new Date().toISOString()
    const event = { offer_id: offerId(), placement: 'card', country: 'NG', session_id: SESSION, ts }
    const seen = await api('post', '/api/v1/events', {
      channel: 'phoenix', events: [{ type: 'impression', ...event }, { type: 'open', ...event }],
    }, { 'Idempotency-Key': `journeys-seen-${Date.now()}` })
    expect(seen.status()).toBe(202)
    expect(await seen.json()).toMatchObject({ accepted: 2, deduped: 0, ignored: 0 })

    const claim = await api('post', '/api/v1/claims', { offer_id: offerId(), session_id: SESSION })
    expect(claim.status()).toBe(201)
    const { code } = await claim.json()
    expect(code).toMatch(/^PHX-[0-9A-Z]{4}$/)
    const claimed = await api('post', '/api/v1/events', {
      channel: 'phoenix', events: [{ type: 'claim', ...event, claim_code: code }],
    }, { 'Idempotency-Key': `journeys-claim-${Date.now()}` })
    expect(await claimed.json()).toMatchObject({ accepted: 1 })
  })

  await test.step('the Phoenix user shares it on WhatsApp and gets a link of their own', async () => {
    const res = await api('post', '/api/v1/share', { offer_id: offerId(), session_id: SESSION, via: 'whatsapp', msisdn: SHARER_MSISDN })
    expect(res.status()).toBe(201)
    shared.shareUrl = (await res.json()).url
    expect(shared.shareUrl).toMatch(/^http:\/\/localhost:3101\/o\/[0-9A-Z]{8}$/)
  })

  await test.step('a friend opens the shared page, sees the offer, and claims their own code', async () => {
    const friend = await newPage(browserRef)
    await friend.goto(shared.shareUrl)
    await expect(friend.getByRole('heading', { name: OFFER.headline })).toBeVisible()
    await expect(friend.getByText(REWARD, { exact: true }).first()).toBeVisible()
    await friend.getByRole('button', { name: L.showCode }).click()
    await expect(friend.getByText(L.yourCode)).toBeVisible()
    await expect(friend.getByText(/PHX-[0-9A-Z]{4}/)).toBeVisible()
  })

  await test.step('Sharing shows the friend under the sharer: their open, and their claim with its reward', async () => {
    await sideLink(member, SHELL.nav.sharing).click()
    await member.waitForURL('**/app/sharing')
    await expect(member.getByRole('heading', { name: SHARING.title, exact: true })).toBeVisible()
    const row = box(member, SHARERS.title).locator('details').filter({ has: member.locator('summary .ph', { hasText: SHARER }) })
    await expect(row.locator('summary')).toContainText(SHARERS.counts(1, 1))
    await expect(row.locator('summary')).toContainText(OFFER.name)
    await row.locator('summary').click()
    await expect(row.getByRole('listitem').filter({ hasText: SHARERS.friendOpen })).toBeVisible()
    await expect(row.getByRole('listitem').filter({ hasText: SHARERS.friendClaim.code })).toContainText(`${REWARD_AMOUNT} airtime`)
  })

  await test.step("the campaign's Recent activity shows the chain, newest first, from the reward back to the impression", async () => {
    await member.goto(shared.campaignPath)
    const sharing = box(member, CAMPAIGN_COPY.sharingBox.title)
    await expect(metricValue(member, CAMPAIGN_COPY.sharingBox.shares, sharing)).toHaveText('1')
    await expect(metricValue(member, CAMPAIGN_COPY.sharingBox.friendsOpened, sharing)).toHaveText('1')
    await expect(metricValue(member, CAMPAIGN_COPY.sharingBox.friendsClaimed, sharing)).toHaveText('1')
    const texts = await box(member, ACTIVITY.title).getByRole('listitem').allTextContents()
    const at = (what: string) => texts.findIndex((t) => t.startsWith(`${what} · `))
    const chain = [
      ACTIVITY.reward(REWARD_AMOUNT, SHARER, 'queued', null),
      ACTIVITY.friendClaim.code(SHARER),
      ACTIVITY.friendOpen(SHARER),
      ACTIVITY.share(SHARER, ACTIVITY.via.whatsapp),
      ACTIVITY.claim.code(ACTIVITY.channels.phoenix),
      ACTIVITY.open(ACTIVITY.channels.phoenix),
      ACTIVITY.impressions(1, ACTIVITY.channels.phoenix),
    ]
    const found = chain.map(at)
    expect(found, texts.join('\n')).not.toContain(-1)
    // Newest first: the reward is above the claim that earned it, the friend's steps above the share, the share above
    // what the Phoenix user did before it.
    expect(found[0]).toBeLessThan(found[1])
    expect(found[1]).toBeLessThan(found[2])
    expect(found[2]).toBeLessThan(found[3])
    expect(found[3]).toBeLessThan(Math.min(found[4], found[5], found[6]))
  })

  await test.step("Global's Rewards ledger shows the reward owed for the campaign", async () => {
    await admin.goto('/admin/rewards')
    await expect(admin.getByRole('heading', { name: REWARDS_LEDGER.title, exact: true })).toBeVisible()
    const row = box(admin, REWARDS_LEDGER.campaignTitle).getByRole('row').filter({ hasText: OFFER.name })
    await expect(row).toContainText(WORKSPACE)
    await expect(row.getByRole('cell').nth(2)).toHaveText('1')
    await expect(row.getByRole('cell').nth(3)).toHaveText(REWARD_AMOUNT)
    // Owed, in whole dollars as the ledger prints money (one ₦50 share is a few cents, so "$0").
    await expect(row.getByRole('cell').nth(4)).toHaveText(/^\$[\d,]+$/)
    // Nothing about it is held.
    await expect(box(admin, REWARDS_LEDGER.heldTitle).getByText(OFFER.name)).toHaveCount(0)
  })
})
