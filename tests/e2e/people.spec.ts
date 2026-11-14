import { expect, test } from '@playwright/test'
import { COPY } from '@/lib/copy'
import { INVITE_PAGE, PEOPLE } from '@/lib/copy-people'
import { SHELL } from '@/lib/copy-shell'
import { box, expectToast, KOLA, PASSWORD, signIn, TUNDE } from './helpers'

// F5: Tunde opens Invite someone, invites a Manager and copies the link the page shows; the invitee opens it in a
// browser of their own, creates an account and lands in Kola Bright; People then lists them as a Manager.

const INVITEE = { name: 'Adaeze Obi', email: 'ada2@kolabright.demo' }

test('F5: an invite link brings a new Manager into the workspace', async ({ browser, baseURL }) => {
  const ownerContext = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })
  const tunde = await ownerContext.newPage()
  await signIn(tunde, TUNDE)
  await tunde.goto('/app/people')
  await expect(tunde.getByRole('heading', { name: PEOPLE.title, exact: true })).toBeVisible()
  const members = box(tunde, PEOPLE.members)
  const openInvites = box(tunde, PEOPLE.openInvites)

  await test.step('Invite someone opens the invite page', async () => {
    await tunde.getByRole('link', { name: PEOPLE.inviteSomeone, exact: true }).click()
    await tunde.waitForURL('**/app/people/invite')
    await expect(tunde.getByRole('heading', { name: PEOPLE.invitePage.title, exact: true })).toBeVisible()
  })
  const invite = box(tunde, PEOPLE.invite)

  await test.step('an address that is not an email is refused', async () => {
    await invite.getByLabel(PEOPLE.emailLabel).fill('ada2-at-kolabright')
    await invite.getByRole('button', { name: PEOPLE.sendInvite }).click()
    await expectToast(tunde, PEOPLE.invalidEmail)
  })

  let link = ''
  await test.step('Tunde invites a Manager, copies the link the page shows and goes back to People', async () => {
    await invite.getByLabel(PEOPLE.emailLabel).fill(INVITEE.email)
    await expect(invite.getByLabel(PEOPLE.roleLabel)).toHaveValue('Manager')
    await invite.getByRole('button', { name: PEOPLE.sendInvite }).click()
    await expectToast(tunde, PEOPLE.inviteSent)
    const sent = box(tunde, PEOPLE.linkTitle)
    const field = sent.getByLabel(PEOPLE.linkLabel)
    await expect(field).toHaveValue(/\/invite\/\S+$/)
    const shown = await field.inputValue()
    await sent.getByRole('button', { name: PEOPLE.copy, exact: true }).click()
    await expectToast(tunde, PEOPLE.linkCopied)
    link = await tunde.evaluate(() => navigator.clipboard.readText())
    expect(link).toBe(shown)
    // The link points at this app (the config's baseURL), on an invite page, and is never in a toast.
    expect(baseURL).toBeTruthy()
    expect(new URL(link).origin).toBe(new URL(baseURL!).origin)
    expect(new URL(link).pathname).toMatch(/^\/invite\/\S+$/)
    await expect(tunde.getByRole('status').filter({ hasText: '/invite/' })).toHaveCount(0)
    await sent.getByRole('link', { name: PEOPLE.invitePage.back }).click()
    await tunde.waitForURL((url) => url.pathname === '/app/people')
    const pending = openInvites.getByRole('listitem').filter({ hasText: INVITEE.email })
    await expect(pending.getByText(PEOPLE.invited('Manager'))).toBeVisible()
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
    await expect(openInvites.getByText(INVITEE.email)).toHaveCount(0)
  })

  await ownerContext.close()
})
