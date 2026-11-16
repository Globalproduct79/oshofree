// The dead-end sweep (Prompt 10): as each role, open every page the console links to and press every control on it that
// is not destructive, and list what did nothing, errored, or landed on a blank or error screen.
//
//   npm run dev:test                       # the test server on 3101, against the seeded oshofree_test
//   npx tsx scripts/ux-sweep.ts            # writes .superpowers/ux/sweep.md (and prints the problems)
//
// It changes the database behind the server the way a person clicking around would (fraud switches, a top-up, an invite,
// a draft…), so it only ever runs against the test server: 3101, checked against .env.test's APP_URL, never the dev
// server on 3100 and its database. Reseed before an e2e run (npm run test:e2e does).
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { parse } from 'dotenv'

const TEST_PORT = '3101'
const BASE = `http://localhost:${TEST_PORT}`

// The test server's address as .env.test gives it; anything but port 3101 there, or here, and nothing runs.
export function sweepTarget(envTest: string, base = BASE): string {
  const appUrl = parse(envTest).APP_URL
  if (!appUrl || new URL(appUrl).port !== TEST_PORT || new URL(base).port !== TEST_PORT)
    throw new Error(`The sweep only runs against the test server on port ${TEST_PORT} (.env.test APP_URL ${appUrl ?? 'missing'}).`)
  return base
}
const OUT = process.env.SWEEP_OUT ?? '.superpowers/ux/sweep.md'
const PASSWORD = 'password'

type Role = { name: string; email: string | null; start: string[]; enter?: string }
const ROLES: Role[] = [
  { name: 'Global', email: 'admin@oshofree.demo', start: ['/admin/review'], enter: 'Kola Bright' },
  { name: 'Owner', email: 'tunde@kolabright.demo', start: ['/app'] },
  { name: 'Manager', email: 'chidi@mediaspec.demo', start: ['/app'] },
  { name: 'Viewer', email: 'kemi@mediaspec.demo', start: ['/app'] },
  { name: 'Signed out', email: null, start: ['/', '/sign-in', '/sign-up', '/invite/not-a-real-token', '/wall', '/o/NOPE0000'] },
]
const only = process.env.SWEEP_ROLES?.split(',')

// Never pressed: they delete, end, refuse, sign out, send money or decide for someone, or leave the role's world.
const DESTRUCTIVE =
  /^(Remove|Revoke|Resend|Reject|Decline|End campaign|Sign out|Sign in as someone else|Rotate key|Close month|Mark paid|Release|Dismiss|Approve|Re-approve|Submit for review|Save and resubmit|Accept as|Pause|Resume|Simulate a day|Run daily job|Start over|Platform \(Global\))/i
// Pressed elsewhere in the sweep (the shell is the same on every page), or plain form fields.
const SHELL_ONLY = /^(Search|Notifications|Workspaces|Menu)\b/i

// A path's pattern: ids become :id, so one campaign page stands for all (two of each are opened).
const pattern = (path: string) =>
  path.replace(/\/[a-z0-9]{20,}(?=\/|$|\?)/gi, '/:id').replace(/\/[0-9A-Z]{8}(?=$|\?)/, '/:code').replace(/\?.*$/, '')

type Finding = { role: string; page: string; control: string; outcome: string; note: string }
const findings: Finding[] = []
const counts = { pages: 0, controls: 0, ok: 0, skipped: 0 }

function record(f: Finding) {
  findings.push(f)
  console.log(`[${f.outcome}] ${f.role} ${f.page} — ${f.control}: ${f.note}`)
}

// What the screen shows, enough to tell whether a press changed anything.
async function snapshot(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector('main') ?? document.body
    const text = (main as HTMLElement).innerText
    return {
      url: location.href,
      text,
      dialogs: document.querySelectorAll('[role=dialog]').length,
      // The toast keeps its words while it fades, so a press that toasted is seen even after the toast has gone.
      toast: document.querySelector('.toast')?.textContent ?? '',
      expanded: document.querySelectorAll('[aria-expanded=true]').length,
      pressed: [...document.querySelectorAll('[aria-pressed],[aria-checked],[aria-selected]')]
        .map((e) => `${e.getAttribute('aria-pressed')}${e.getAttribute('aria-checked')}${e.getAttribute('aria-selected')}`)
        .join(''),
      open: document.querySelectorAll('details[open]').length,
      focus: document.activeElement?.outerHTML.slice(0, 120) ?? '',
      busy: document.querySelectorAll('[aria-busy=true],:disabled').length,
    }
  })
}
const digest = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 8)

// A screen a person would call broken: Next's error page, a 404 inside the console, or a page with nothing on it.
async function screenProblem(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const body = document.body?.innerText ?? ''
    // Next's own screens, and ours inside the shell (Prompt 10's not-found and failed boxes).
    if (/Application error|Unhandled Runtime Error|Internal Server Error|This page could not be found|Something went wrong!|This page isn't here|This page didn't load/i.test(body))
      return body.split('\n').find((l) => /error|not be found|went wrong|isn't here|didn't load/i.test(l)) ?? 'error page'
    const main = document.querySelector('main')
    const text = (main ?? document.body).innerText.trim()
    if (text.length < 15) return `blank (${JSON.stringify(text)})`
    return null
  })
}

async function signIn(context: BrowserContext, email: string): Promise<Page> {
  const page = await context.newPage()
  // Next dev drops a page it has not served for a minute and compiles it again on the next visit: allow for that.
  await page.goto(`${BASE}/sign-in`, { timeout: 120_000 })
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((u) => u.pathname === '/app' || u.pathname.startsWith('/admin'), { timeout: 60_000 })
  return page
}

// The page's own controls: buttons, tabs, switches, <summary> rows and links in <main>, visible and enabled, each with
// its accessible name (aria-label, aria-labelledby, its text, or its title) and its index among them. A fresh load of the
// same page lists them in the same order, so the index finds the same control again (data-sweep-i).
const CANDIDATES = 'button,[role=button],[role=tab],[role=switch],a[href],summary'
async function controls(page: Page): Promise<{ kind: 'button' | 'link'; name: string; i: number }[]> {
  return page.evaluate((sel) => {
    const main = document.querySelector('main')
    if (!main) return []
    const out: { kind: 'button' | 'link'; name: string; i: number }[] = []
    let i = 0
    for (const el of main.querySelectorAll<HTMLElement>(sel)) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') continue
      el.setAttribute('data-sweep-i', String(i))
      const labelledBy = el.getAttribute('aria-labelledby')
      const byRef = labelledBy ? labelledBy.split(' ').map((id) => document.getElementById(id)?.innerText ?? '').join(' ') : ''
      const name = (el.getAttribute('aria-label') || byRef || el.innerText || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 80)
      out.push({ kind: el.tagName === 'A' ? 'link' : 'button', name, i })
      i++
    }
    return out
  }, CANDIDATES)
}

async function load(page: Page, url: string): Promise<{ status: number; problem: string | null }> {
  const res = await page.goto(url, { waitUntil: 'load', timeout: 90_000 })
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
  return { status: res?.status() ?? 0, problem: await screenProblem(page) }
}

// Repeated controls (a list's rows, every row's Show more) are pressed three times at most per page: the rest are the
// same control on other data.
const REPEATS = 3
const shape = (c: { name: string }) => c.name.replace(/[\d+•₦$,.:]+/g, '#').split(' ').slice(0, 2).join(' ')

async function pressAll(page: Page, role: string, url: string) {
  const path = new URL(url).pathname + new URL(url).search
  const list = (await controls(page)).filter((c) => c.kind === 'button')
  const seen = new Map<string, number>()
  for (const c of list) {
    const label = c.name || '(no name)'
    if (DESTRUCTIVE.test(c.name) || SHELL_ONLY.test(c.name)) {
      counts.skipped++
      continue
    }
    const n = seen.get(shape(c)) ?? 0
    seen.set(shape(c), n + 1)
    if (n >= REPEATS) {
      counts.skipped++
      continue
    }
    counts.controls++
    const errors: string[] = []
    const onError = (e: Error) => errors.push(e.message.split('\n')[0])
    page.on('pageerror', onError)
    try {
      await load(page, url)
      const again = await controls(page)
      const same = again.find((x) => x.i === c.i)
      if (!same || same.name !== c.name) {
        record({ role, page: path, control: label, outcome: 'could not find again', note: 'the page drew differently on a fresh load' })
        continue
      }
      const el = page.locator(`[data-sweep-i="${c.i}"]`)
      const before = await snapshot(page)
      const chooser = page.waitForEvent('filechooser', { timeout: 2500 }).then(() => true).catch(() => false)
      const popup = page.context().waitForEvent('page', { timeout: 2500 }).then(() => true).catch(() => false)
      // A press that calls a server action should show it is on its way: the control goes off or busy meanwhile.
      let actions = 0
      const onRequest = (r: import('@playwright/test').Request) => {
        if (r.method() === 'POST' && r.headers()['next-action']) actions++
      }
      page.on('request', onRequest)
      await el.click({ timeout: 8000 })
      let pendingShown = false
      for (let t = 0; t < 600 && !pendingShown; t += 40) {
        pendingShown = await el
          .evaluate((e) => (e as HTMLButtonElement).disabled || e.getAttribute('aria-busy') === 'true' || e.getAttribute('aria-disabled') === 'true')
          .catch(() => false)
        if (!pendingShown) await page.waitForTimeout(40)
      }
      // Wait for the press to show: a server action, the redraw it asks for, or the next page compiling on first visit
      // can take seconds here, so a press is only called a dead end after 15 s without any change.
      let chose = false
      let opened = false
      void chooser.then((v) => (chose = v))
      void popup.then((v) => (opened = v))
      const changed = (a: Awaited<ReturnType<typeof snapshot>>) =>
        chose || opened || before.url !== a.url || before.dialogs !== a.dialogs || a.toast !== before.toast ||
        before.expanded !== a.expanded || before.pressed !== a.pressed || before.open !== a.open ||
        digest(before.text) !== digest(a.text) || before.focus !== a.focus
      let after = await snapshot(page).catch(() => before)
      // Whatever the press already showed by now (an optimistic switch, a panel, a dialog) is feedback enough.
      const showedAtOnce = changed(after)
      for (let waited = 0; !changed(after) && waited < 15_000; waited += 300) {
        await page.waitForTimeout(300)
        after = await snapshot(page).catch(() => after)
      }
      // Let a navigation that started finish before judging the screen it led to.
      await page.waitForLoadState('load', { timeout: 30_000 }).catch(() => {})
      await page.waitForTimeout(500)
      after = await snapshot(page).catch(() => after)
      const problem = await screenProblem(page)
      if (errors.length) record({ role, page: path, control: label, outcome: 'error', note: errors.join('; ') })
      else if (problem) record({ role, page: path, control: label, outcome: 'broken screen', note: `${problem} at ${new URL(after.url).pathname}` })
      else if (changed(after)) {
        counts.ok++
        // A press that showed something at once (a dialog with "Loading the offers live now…", a switch that moves
        // before it saves, the wall's offer panel) needs no busy control; one that showed nothing until its action answered does.
        if (actions > 0 && !pendingShown && !showedAtOnce)
          record({ role, page: path, control: label, outcome: 'no pending state', note: 'called a server action with the control still on' })
      }
      else record({ role, page: path, control: label, outcome: 'nothing happened', note: 'no navigation, dialog, toast, or change on the page' })
    } catch (e) {
      record({ role, page: path, control: label, outcome: 'could not press', note: (e as Error).message.split('\n')[0] })
    } finally {
      page.off('pageerror', onError)
      page.removeAllListeners('request')
    }
  }
}

async function sweepRole(browser: Browser, role: Role) {
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })
  const page = role.email ? await signIn(context, role.email) : await context.newPage()
  const queue = role.start.map((p) => `${BASE}${p}`)
  const seenPattern = new Map<string, number>()
  const visited = new Set<string>()

  const crawl = async () => {
    while (queue.length) {
      const url = queue.shift()!
      const u = new URL(url)
      if (u.origin !== BASE) continue
      const key = u.pathname + u.search
      if (visited.has(key)) continue
      const pat = pattern(key)
      const n = seenPattern.get(pat) ?? 0
      if (n >= 2) continue
      seenPattern.set(pat, n + 1)
      visited.add(key)
      counts.pages++
      const errors: string[] = []
      const onError = (e: Error) => errors.push(e.message.split('\n')[0])
      page.on('pageerror', onError)
      let status = 0
      let problem: string | null = null
      try {
        ;({ status, problem } = await load(page, url))
      } catch (e) {
        record({ role: role.name, page: key, control: '(open the page)', outcome: 'could not open', note: (e as Error).message.split('\n')[0] })
        continue
      } finally {
        page.off('pageerror', onError)
      }
      const landed = new URL(page.url())
      const expectedGone = key.startsWith('/o/NOPE') || key.startsWith('/invite/not-a-real')
      if (status >= 400 && !expectedGone) record({ role: role.name, page: key, control: '(open the page)', outcome: `HTTP ${status}`, note: problem ?? '' })
      else if (problem && !expectedGone) record({ role: role.name, page: key, control: '(open the page)', outcome: 'broken screen', note: problem })
      if (errors.length) record({ role: role.name, page: key, control: '(open the page)', outcome: 'error', note: errors.join('; ') })
      if (landed.pathname + landed.search !== key && !landed.pathname.startsWith('/o/'))
        console.log(`  (${key} → ${landed.pathname}${landed.search})`)
      // Every link on it goes on the list (the sidebar's too); then each button is pressed on a fresh load.
      const links = await page.evaluate(() => [...document.querySelectorAll<HTMLAnchorElement>('a[href]')].map((a) => a.href))
      for (const l of links) if (l.startsWith(BASE) && !l.includes('/api/') && !/\.(pdf|jpg|png|mp4)$/.test(l)) queue.push(l.split('#')[0])
      // The controls are pressed on the first page of each pattern; the second (another campaign, say) is only opened.
      if (status < 400 && !problem && n === 0) await pressAll(page, role.name, url)
    }
  }
  await crawl()
  // Global also goes inside a workspace, through the switcher, and sweeps the console there.
  if (role.enter) {
    await page.goto(`${BASE}/admin/review`)
    await page.getByRole('button', { name: 'Workspaces', exact: true }).click()
    await page.getByRole('region', { name: 'Workspaces' }).getByRole('button', { name: new RegExp(`^${role.enter}`) }).click()
    await page.waitForURL((u) => u.pathname === '/app', { timeout: 60_000 })
    queue.push(`${BASE}/app`)
    await crawl()
  }
  await shell(page, role)
  await context.close()
}

// The shell's own controls, once per role: search, bell, workspaces (each opens its panel and Escape closes it).
async function shell(page: Page, role: Role) {
  if (!role.email) return
  const start = role.name === 'Global' ? '/admin/review' : '/app'
  await load(page, `${BASE}${start}`)
  for (const name of ['Search', 'Notifications', 'Workspaces']) {
    counts.controls++
    try {
      const before = await snapshot(page)
      await page.getByRole('button', { name: new RegExp(`^${name}`) }).first().click({ timeout: 8000 })
      await page.waitForTimeout(500)
      const opened = await page.evaluate(() => document.querySelectorAll('[role=dialog],[role=region][aria-label]').length)
      const after = await snapshot(page)
      if (opened === 0 && before.expanded === after.expanded)
        record({ role: role.name, page: start, control: name, outcome: 'nothing happened', note: 'no panel opened' })
      else counts.ok++
      await page.keyboard.press('Escape')
    } catch (e) {
      record({ role: role.name, page: start, control: name, outcome: 'could not press', note: (e as Error).message.split('\n')[0] })
    }
  }
}

async function main() {
  sweepTarget(readFileSync('.env.test', 'utf8'))
  const browser = await chromium.launch()
  const started = Date.now()
  for (const role of ROLES) {
    if (only && !only.includes(role.name)) continue
    console.log(`== ${role.name}`)
    await sweepRole(browser, role)
  }
  await browser.close()
  const rows = findings.map((f) => `| ${f.role} | \`${f.page}\` | ${f.control.replace(/\|/g, '\\|')} | ${f.outcome} | ${f.note.replace(/\|/g, '\\|')} |`)
  const md = [
    `# Dead-end sweep — ${new Date().toISOString()}`,
    '',
    `${counts.pages} pages opened, ${counts.controls} controls pressed (${counts.ok} did something), ${counts.skipped} skipped as destructive or shell-only; ${findings.length} findings, ${Math.round((Date.now() - started) / 1000)} s.`,
    '',
    '| Role | Page | Control | Outcome | Note |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n')
  mkdirSync(OUT.split('/').slice(0, -1).join('/') || '.', { recursive: true })
  writeFileSync(OUT, md)
  console.log(md.split('\n').slice(0, 3).join('\n'))
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
