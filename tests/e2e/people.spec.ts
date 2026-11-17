import { expect, type Locator, type Page, test } from '@playwright/test'
import { COPY } from '@/lib/copy'
import { INVITE_PAGE, PEOPLE } from '@/lib/copy-people'
import { SHELL } from '@/lib/copy-shell'
import { box, expectToast, KOLA, PASSWORD, signIn, TUNDE } from './helpers'

// F5: Tunde opens People and Invite user, invites a Manager and sees the pending invite with its link. Back on
// People, Resend gives a new link and the old one stops working. The invitee opens the new link in a browser of their
// own, creates an account and lands in Kola Bright; People's Members then lists them as a Manager and no invite is open.

const INVITEE = { name: 'Adaeze Obi', email: 'ada2@kolabright.demo' }

// The link in `scope`'s read-only field, copied with its Copy button: the clipboard holds what the field shows,
// and no toast ever carries a link.
async function copyLink(page: Page, scope: Locator): Promise<string> {
  const field = scope.getByLabel(PEOPLE.linkLabel, { exact: true })
  await expect(field).toHaveValue(/\/invite\/\S+$/)
  const shown = await field.inputValue()
  await scope.getByRole('button', { name: PEOPLE.copy, exact: true }).click()
  await expectToast(page, PEOPLE.linkCopied)
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(shown)
  await expect(page.getByRole('status').filter({ hasText: '/invite/' })).toHaveCount(0)
  return shown
}

test('F5: an invite from People, resent, brings a new Manager into the workspace', async ({ browser, baseURL }) => {
  const ownerContext = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })
  const tunde = await ownerContext.newPage()
  await signIn(tunde, TUNDE)
  const team = box(tunde, PEOPLE.members)
  const pending = box(tunde, PEOPLE.openInvites)

  await test.step('the sidebar opens People: the members, with Tunde marked as them, and no open invite', async () => {
    await tunde.getByRole('link', { name: SHELL.nav.people, exact: true }).click()
    await tunde.waitForURL((url) => url.pathname === '/app/people')
    await expect(tunde.getByRole('heading', { name: PEOPLE.title, exact: true })).toBeVisible()
    await expect(tunde.getByRole('button', { name: SHELL.switcher.label(KOLA) })).toBeVisible()
    await expect(team.getByRole('listitem').filter({ hasText: 'Tunde Okafor' }).getByText(PEOPLE.you, { exact: true })).toBeVisible()
    await expect(pending.getByText(PEOPLE.noOpenInvites)).toBeVisible()
  })

  await test.step('Invite user opens the invite page, under People', async () => {
    await tunde.getByRole('link', { name: PEOPLE.inviteUser, exact: true }).click()
    await tunde.waitForURL('**/app/people/invite')
    await expect(tunde.getByRole('heading', { name: PEOPLE.invitePage.title, exact: true })).toBeVisible()
    await expect(tunde.locator('.crumb').getByRole('link', { name: PEOPLE.crumb })).toHaveAttribute('href', '/app/people')
    await expect(tunde.locator('.crumb').getByRole('link', { name: SHELL.groups.organisation })).toHaveCount(0)
  })
  const form = box(tunde, PEOPLE.invite)

  await test.step('an address that is not an email is refused', async () => {
    await form.getByLabel(PEOPLE.emailLabel).fill('ada2-at-kolabright')
    await form.getByRole('button', { name: PEOPLE.sendInvite }).click()
    await expectToast(tunde, PEOPLE.invalidEmail)
  })

  let oldLink = ''
  await test.step('Tunde invites a Manager and sees the pending invite, its link, Resend and Revoke', async () => {
    await form.getByLabel(PEOPLE.emailLabel).fill(INVITEE.email)
    await expect(form.getByLabel(PEOPLE.roleLabel)).toHaveValue('Manager')
    await form.getByRole('button', { name: PEOPLE.sendInvite }).click()
    await expectToast(tunde, PEOPLE.inviteSent)
    const sent = box(tunde, PEOPLE.invitePage.pendingTitle)
    const row = sent.getByRole('listitem').filter({ hasText: INVITEE.email })
    await expect(row.getByText(/^Manager · expires \d+ \w+$/)).toBeVisible()
    await expect(row.getByRole('button', { name: PEOPLE.resend, exact: true })).toBeVisible()
    await expect(row.getByRole('button', { name: PEOPLE.revoke, exact: true })).toBeVisible()
    oldLink = await copyLink(tunde, row)
    // The link points at this app (the config's baseURL), on an invite page.
    expect(baseURL).toBeTruthy()
    expect(new URL(oldLink).origin).toBe(new URL(baseURL!).origin)
    expect(new URL(oldLink).pathname).toMatch(/^\/invite\/\S+$/)
    await expect(sent.getByRole('link', { name: PEOPLE.invitePage.back })).toHaveAttribute('href', '/app/people')
  })

  await test.step('Invite another brings back an empty form; the crumb leads back to People', async () => {
    await tunde.getByRole('button', { name: PEOPLE.invitePage.another, exact: true }).click()
    await expect(form.getByLabel(PEOPLE.emailLabel)).toHaveValue('')
    await expect(form.getByLabel(PEOPLE.roleLabel)).toHaveValue('Manager')
    await expect(tunde.getByLabel(PEOPLE.linkLabel, { exact: true })).toHaveCount(0)
    await tunde.locator('.crumb').getByRole('link', { name: PEOPLE.crumb }).click()
    await tunde.waitForURL((url) => url.pathname === '/app/people')
  })

  let newLink = ''
  await test.step('People lists the open invite, with no link until Resend shows a new one', async () => {
    const row = pending.getByRole('listitem').filter({ hasText: INVITEE.email })
    await expect(row.getByText(/^Manager · invited by Tunde Okafor · expires \d+ \w+$/)).toBeVisible()
    await expect(row.getByLabel(PEOPLE.linkLabel, { exact: true })).toHaveCount(0)
    await row.getByRole('button', { name: PEOPLE.resend, exact: true }).click()
    await expectToast(tunde, PEOPLE.resent)
    newLink = await copyLink(tunde, row)
    expect(newLink).not.toBe(oldLink)
  })

  await test.step('the old link no longer works', async () => {
    const stranger = await browser.newContext()
    const page = await stranger.newPage()
    await page.goto(oldLink)
    await expect(page.getByText(INVITE_PAGE.invalid)).toBeVisible()
    await expect(page.getByRole('link', { name: INVITE_PAGE.createAccount })).toHaveCount(0)
    await stranger.close()
  })

  await test.step('the invitee opens the new link in a fresh browser, creates an account and lands in Kola Bright', async () => {
    const inviteeContext = await browser.newContext()
    const invitee = await inviteeContext.newPage()
    await invitee.goto(newLink)
    await expect(invitee.getByText(INVITE_PAGE.headline('Tunde Okafor', KOLA, 'Manager'))).toBeVisible()
    await invitee.getByRole('link', { name: INVITE_PAGE.createAccount }).click()
    await invitee.waitForURL('**/sign-up?invite=*')
    await invitee.getByLabel(COPY.auth.nameLabel, { exact: true }).fill(INVITEE.name)
    await invitee.getByLabel(COPY.auth.emailLabel).fill(INVITEE.email)
    await invitee.getByLabel(COPY.auth.passwordLabel).fill(PASSWORD)
    await invitee.getByRole('button', { name: COPY.auth.signUpAction }).click()
    await invitee.waitForURL((url) => url.pathname === '/app')
    await expect(invitee.getByRole('button', { name: SHELL.switcher.label(KOLA) })).toBeVisible()
    await inviteeContext.close()
  })

  await test.step("People's Members lists them as a Manager, and no invite is open", async () => {
    await tunde.reload()
    const row = team.getByRole('listitem').filter({ hasText: INVITEE.name })
    await expect(row.getByText(INVITEE.email)).toBeVisible()
    await expect(row.getByRole('combobox')).toHaveValue('Manager')
    await expect(pending.getByText(INVITEE.email)).toHaveCount(0)
    await expect(pending.getByText(PEOPLE.noOpenInvites)).toBeVisible()
  })

  await ownerContext.close()
})
