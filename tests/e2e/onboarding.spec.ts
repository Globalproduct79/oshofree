import { expect, type Page, test } from '@playwright/test'
import { COPY } from '@/lib/copy'
import { HOME } from '@/lib/copy-home'
import { INVITE_PAGE, PEOPLE } from '@/lib/copy-people'
import { REVIEW } from '@/lib/copy-review'
import { SHELL } from '@/lib/copy-shell'
import { ADMIN, box, expectInWorkspace, expectToast, signIn } from './helpers'

// F6, onboarding: a new owner signs up and creates a workspace, which waits under the banner until Global approves
// it on Review. The owner invites a Manager and a Viewer from People. The Manager opens their link, creates
// an account and lands in the workspace with New campaign but no Invite user. On the same browser the Viewer's link
// sees the Manager is already in (and offers the workspace, not the invite); "Sign in as someone else" leads to
// sign-in and on to sign-up, and the Viewer lands with neither. The owner makes the Viewer a Manager (their next
// page load offers New campaign), then removes them (their next page load is New workspace). A used link on
// sign-in or sign-up then says to ask for a new one and goes on without the invite.

test.describe.configure({ mode: 'serial' })

const WORKSPACE = 'Sunrise Foods'
const PASSWORD = 'password123'
const OWNER = { name: 'Bisi Adeyemi', email: 'bisi@sunrisefoods.demo' }
const MANAGER = { name: 'Emeka Udo', email: 'emeka@sunrisefoods.demo' }
const VIEWER = { name: 'Funke Ade', email: 'funke@sunrisefoods.demo' }

const pendingBanner = (page: Page) => page.getByRole('status').filter({ hasText: SHELL.banner.pending.text })
const sideNewCampaign = (page: Page) => page.locator('.side').getByRole('link', { name: SHELL.nav.newCampaign, exact: true })
const headNewCampaign = (page: Page) => page.locator('.head').getByRole('link', { name: HOME.newCampaign, exact: true })
const inviteUser = (page: Page) => page.getByRole('link', { name: PEOPLE.inviteUser, exact: true })

// The shell is drawn for this workspace (so an absence checked next is real, not a page still loading).
async function inWorkspace(page: Page) {
  await expectInWorkspace(page, WORKSPACE)
}

// Sign-up opened from an invite: the line names the workspace and role, the email starts at the invited address.
async function signUpFromInvite(page: Page, who: { name: string; email: string }, role: 'Manager' | 'Viewer') {
  await page.waitForURL('**/sign-up?invite=*')
  await expect(page.getByText(INVITE_PAGE.joining(WORKSPACE, role), { exact: true })).toBeVisible()
  await expect(page.getByLabel(COPY.auth.emailLabel)).toHaveValue(who.email)
  await page.getByLabel(COPY.auth.nameLabel, { exact: true }).fill(who.name)
  await page.getByLabel(COPY.auth.passwordLabel).fill(PASSWORD)
  await page.getByRole('button', { name: COPY.auth.signUpAction }).click()
  // The workspace's home, which says whom they joined as, then drops the query that asked it to.
  await page.waitForURL((url) => url.pathname === '/app')
  await expectToast(page, INVITE_PAGE.joined(WORKSPACE, role))
  await inWorkspace(page)
  await expect.poll(() => new URL(page.url()).search).toBe('')
}

// People, drawn.
async function people(page: Page) {
  await page.goto('/app/people')
  await expect(page.getByRole('heading', { name: PEOPLE.title, exact: true })).toBeVisible()
}

test('F6: a new owner is approved, invites a Manager and a Viewer, and each sees what their role allows', async ({ browser }) => {
  // Three people, four browsers' worth of first page loads on the dev server.
  test.setTimeout(300_000)
  const ownerContext = await browser.newContext()
  const owner = await ownerContext.newPage()
  const adminContext = await browser.newContext()
  const admin = await adminContext.newPage()
  // One browser that the Manager, then the Viewer, use.
  const deskContext = await browser.newContext()
  const desk = await deskContext.newPage()

  await test.step('a new owner signs up and creates the workspace; its home waits under the awaiting-approval banner', async () => {
    await owner.goto('/sign-up')
    await expect(owner.getByText(/You're joining/)).toHaveCount(0)
    await owner.getByLabel(COPY.auth.nameLabel, { exact: true }).fill(OWNER.name)
    await owner.getByLabel(COPY.auth.emailLabel).fill(OWNER.email)
    await owner.getByLabel(COPY.auth.passwordLabel).fill(PASSWORD)
    await owner.getByRole('button', { name: COPY.auth.signUpAction }).click()
    await owner.waitForURL('**/app/new-workspace')
    await owner.getByLabel(COPY.workspace.nameLabel).fill(WORKSPACE)
    await owner.getByLabel(COPY.workspace.typeLabel).selectOption('Brand')
    await owner.getByLabel(COPY.workspace.countryLabel).selectOption('NG')
    await owner.getByRole('button', { name: COPY.workspace.createAction }).click()
    await owner.waitForURL((url) => url.pathname === '/app')
    await inWorkspace(owner)
    await expect(pendingBanner(owner)).toBeVisible()
  })

  await test.step('Global approves it on Review', async () => {
    await signIn(admin, ADMIN)
    await admin.goto('/admin/review')
    const row = box(admin, REVIEW.advertisers.title)
      .locator('div')
      .filter({ has: admin.getByText(WORKSPACE, { exact: true }) })
      .filter({ has: admin.getByRole('button', { name: REVIEW.advertisers.approve, exact: true }) })
      .last()
    await row.getByRole('button', { name: REVIEW.advertisers.approve, exact: true }).click()
    await expectToast(admin, REVIEW.toast.workspaceApproved(WORKSPACE))
  })

  await test.step("the owner's next page load is live: the banner is gone", async () => {
    await owner.reload()
    await inWorkspace(owner)
    await expect(pendingBanner(owner)).toHaveCount(0)
  })

  const links = { Manager: '', Viewer: '' }
  await test.step('the owner invites a Manager and a Viewer from People', async () => {
    await owner.getByRole('link', { name: SHELL.nav.people, exact: true }).click()
    await owner.waitForURL((url) => url.pathname === '/app/people')
    await inviteUser(owner).click()
    await owner.waitForURL('**/app/people/invite')
    for (const [role, who] of [['Manager', MANAGER], ['Viewer', VIEWER]] as const) {
      const form = box(owner, PEOPLE.invite)
      await form.getByLabel(PEOPLE.emailLabel).fill(who.email)
      await form.getByLabel(PEOPLE.roleLabel).selectOption(role)
      await form.getByRole('button', { name: PEOPLE.sendInvite }).click()
      const field = box(owner, PEOPLE.invitePage.pendingTitle).getByLabel(PEOPLE.linkLabel, { exact: true })
      await expect(field).toHaveValue(/\/invite\/\S+$/)
      links[role] = await field.inputValue()
      await owner.getByRole('button', { name: PEOPLE.invitePage.another, exact: true }).click()
    }
    expect(links.Manager).not.toBe(links.Viewer)
  })

  await test.step('the Manager opens their link, creates an account and lands in the workspace, told so', async () => {
    await desk.goto(links.Manager)
    await expect(desk.getByText(INVITE_PAGE.headline(OWNER.name, WORKSPACE, 'Manager'))).toBeVisible()
    await desk.getByRole('link', { name: INVITE_PAGE.createAccount }).click()
    await signUpFromInvite(desk, MANAGER, 'Manager')
  })

  await test.step('the Manager sees New campaign, but not Invite user', async () => {
    await expect(sideNewCampaign(desk)).toBeVisible()
    await expect(headNewCampaign(desk)).toBeVisible()
    await people(desk)
    await expect(inviteUser(desk)).toHaveCount(0)
  })

  await test.step("on the same browser the Viewer's link sees the Manager is already in; Sign in as someone else", async () => {
    await desk.goto(links.Viewer)
    await expect(desk.getByText(INVITE_PAGE.alreadyIn(WORKSPACE))).toBeVisible()
    await expect(desk.getByText(INVITE_PAGE.signedInAs(MANAGER.name, MANAGER.email))).toBeVisible()
    await expect(desk.getByRole('button', { name: INVITE_PAGE.open(WORKSPACE) })).toBeVisible()
    await expect(desk.getByRole('button', { name: /^Accept as/ })).toHaveCount(0)
    await desk.getByRole('button', { name: INVITE_PAGE.signInOther }).click()
    // Signed out, on sign-in with the same link: it names the workspace and role, and starts at the invited email.
    await desk.waitForURL('**/sign-in?invite=*')
    await expect(desk.getByText(INVITE_PAGE.joining(WORKSPACE, 'Viewer'), { exact: true })).toBeVisible()
    await expect(desk.getByLabel(COPY.auth.emailLabel)).toHaveValue(VIEWER.email)
  })

  await test.step('the Viewer creates an account from there and lands in the workspace, told so', async () => {
    await desk.getByRole('link', { name: COPY.auth.toSignUp }).click()
    await signUpFromInvite(desk, VIEWER, 'Viewer')
  })

  await test.step('the Viewer sees neither New campaign nor Invite user', async () => {
    await expect(sideNewCampaign(desk)).toHaveCount(0)
    await expect(headNewCampaign(desk)).toHaveCount(0)
    await people(desk)
    await expect(inviteUser(desk)).toHaveCount(0)
  })

  const team = box(owner, PEOPLE.members)
  await test.step("the owner makes the Viewer a Manager on People; the Viewer's next page load offers New campaign", async () => {
    await people(owner)
    const select = team.getByRole('combobox', { name: PEOPLE.roleFor(VIEWER.name) })
    await expect(select).toHaveValue('Viewer')
    // The change is stored when its server action (a POST to this page) answers.
    await Promise.all([
      owner.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/app/people'),
      select.selectOption('Manager'),
    ])
    await expect(select).toHaveValue('Manager')
    await desk.goto('/app')
    await inWorkspace(desk)
    await expect(sideNewCampaign(desk)).toBeVisible()
    await expect(headNewCampaign(desk)).toBeVisible()
  })

  await test.step('the owner removes them; their next page load lands on New workspace', async () => {
    const row = team.getByRole('listitem').filter({ hasText: VIEWER.email })
    await Promise.all([
      owner.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/app/people'),
      row.getByRole('button', { name: PEOPLE.remove, exact: true }).click(),
    ])
    await expect(team.getByText(VIEWER.email)).toHaveCount(0)
    await desk.reload()
    await desk.waitForURL('**/app/new-workspace')
    await expect(desk.getByRole('heading', { name: COPY.workspace.newTitle })).toBeVisible()
  })

  await test.step('a used link on sign-in or sign-up says to ask for a new one, and goes on without the invite', async () => {
    const used = new URL(links.Manager).pathname.split('/').pop()
    for (const [path, way] of [['/sign-in', INVITE_PAGE.signInWithout], ['/sign-up', INVITE_PAGE.signUpWithout]] as const) {
      await desk.goto(`${path}?invite=${used}`)
      await expect(desk.getByText(INVITE_PAGE.invalid)).toBeVisible()
      await expect(desk.getByText(INVITE_PAGE.askForNew)).toBeVisible()
      await desk.getByRole('link', { name: way, exact: true }).click()
      await desk.waitForURL((url) => url.pathname === path && url.search === '')
      await expect(desk.getByLabel(COPY.auth.emailLabel)).toHaveValue('')
      await expect(desk.getByText(/You're joining/)).toHaveCount(0)
    }
  })

  await ownerContext.close()
  await adminContext.close()
  await deskContext.close()
})
