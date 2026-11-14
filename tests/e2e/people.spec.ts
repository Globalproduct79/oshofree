import { expect, test } from '@playwright/test'
import { COPY } from '@/lib/copy'
import { INVITE_PAGE, PEOPLE } from '@/lib/copy-people'
import { SHELL } from '@/lib/copy-shell'
import { box, expectToast, KOLA, PASSWORD, signIn, TUNDE } from './helpers'

// F5: Tunde invites a Manager, copies the invite link, and the invitee opens it in a browser of their own,
// creates an account and lands in Kola Bright; People then lists them as a Manager.

const INVITEE = { name: 'Adaeze Obi', email: 'ada2@kolabright.demo' }

test('F5: an invite link brings a new Manager into the workspace', async ({ browser, baseURL }) => {
  const ownerContext = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })
  const tunde = await ownerContext.newPage()
  await signIn(tunde, TUNDE)
  await tunde.goto('/app/people')
  await expect(tunde.getByRole('heading', { name: PEOPLE.title, exact: true })).toBeVisible()
  const members = box(tunde, PEOPLE.members)
  const invite = box(tunde, PEOPLE.invite)

  await test.step('an address that is not an email is refused', async () => {
    await invite.getByLabel(PEOPLE.emailLabel).fill('ada2-at-kolabright')
    await invite.getByRole('button', { name: PEOPLE.sendInvite }).click()
    await expectToast(tunde, PEOPLE.invalidEmail)
  })

  let link = ''
  await test.step('Tunde invites a Manager and copies the link', async () => {
    await invite.getByLabel(PEOPLE.emailLabel).fill(INVITEE.email)
    await expect(invite.getByLabel(PEOPLE.roleLabel)).toHaveValue('Manager')
    await invite.getByRole('button', { name: PEOPLE.sendInvite }).click()
    await expectToast(tunde, PEOPLE.inviteSent)
    const pending = members.getByRole('listitem').filter({ hasText: INVITEE.email })
    await expect(pending.getByText(PEOPLE.invited('Manager'))).toBeVisible()
    await pending.getByRole('button', { name: PEOPLE.copyLink }).click()
    await expectToast(tunde, PEOPLE.linkCopied)
    link = await tunde.evaluate(() => navigator.clipboard.readText())
    // The link points at this app (the config's baseURL), on an invite page.
    expect(baseURL).toBeTruthy()
    expect(new URL(link).origin).toBe(new URL(baseURL!).origin)
    expect(new URL(link).pathname).toMatch(/^\/invite\/\S+$/)
  })

  await test.step('the invitee opens the link in a fresh browser, creates an account and lands in Kola Bright', async () => {
    const inviteeContext = await browser.newContext()
    const invitee = await inviteeContext.newPage()
    await invitee.goto(link)
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

  await test.step('People lists them as a Manager, and the invite is gone', async () => {
    await tunde.reload()
    const row = members.getByRole('listitem').filter({ hasText: INVITEE.name })
    await expect(row.getByText(INVITEE.email)).toBeVisible()
    await expect(row.getByRole('combobox')).toHaveValue('Manager')
    await expect(members.getByText(PEOPLE.invited('Manager'))).toHaveCount(0)
  })

  await ownerContext.close()
})
