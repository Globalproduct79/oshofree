import { readFileSync } from 'node:fs'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import AdminLoading from '@/app/admin/loading'
import ConsoleLoading from '@/app/app/(console)/loading'
import { pendingState, SubmitButton } from '@/components/og/SubmitButton'
import { PageSkeleton } from '@/components/shell/PageSkeleton'
import { savePref } from '@/app/app/(console)/notifications/PrefsClient'
import { getToast, takeToast } from '@/components/shell/toast-store'
import { NOTIFICATIONS_PAGE } from '@/lib/copy-notifications-page'
import { SHELL } from '@/lib/copy-shell'

// The notification settings' action module reads the session; nothing here signs in.
vi.mock('@/lib/auth', () => ({ auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const html = (el: ReactElement) => renderToStaticMarkup(el)

// Prompt 10: a form's submit is off and marked busy from the press until its action answers. useFormStatus is only ever
// pending in the browser, so the markup is checked at rest and the pending look through pendingState.
describe('SubmitButton', () => {
  it('is an og submit button, on and not busy at rest', () => {
    const out = html(
      <form>
        <SubmitButton variant="primary">Save</SubmitButton>
      </form>,
    )
    expect(out).toContain('type="submit"')
    expect(out).toContain('class="btn p"')
    expect(out).not.toContain('disabled')
    expect(out).not.toContain('aria-busy')
    expect(out).toContain('>Save</button>')
  })

  it("keeps the caller's own look when plain (a switcher row, the banner's link), and the caller's own disabled", () => {
    const out = html(
      <form>
        <SubmitButton plain className="row" disabled>
          Kola Bright
        </SubmitButton>
      </form>,
    )
    expect(out).toBe('<form><button class="row" type="submit" disabled="">Kola Bright</button></form>')
  })

  it('while its form is on its way: off, and busy for assistive tech', () => {
    expect(pendingState(true, false)).toEqual({ type: 'submit', disabled: true, 'aria-busy': true })
    expect(pendingState(false, false)).toEqual({ type: 'submit', disabled: false, 'aria-busy': undefined })
    expect(pendingState(false, true)).toEqual({ type: 'submit', disabled: true, 'aria-busy': undefined })
  })
})

// Route-level loading: the shell stays, the page's place holds a head and three boxes in the design system's grey, and a
// screen reader hears that it is loading.
describe('loading skeletons', () => {
  const shape = (out: string) => {
    expect(out).toContain('aria-busy="true"')
    expect(out).toContain(`<span class="sr-only">${SHELL.loading}</span>`)
    expect(out.match(/class="box sk-box"/g)).toHaveLength(3)
    expect(out).toContain('class="head"')
    expect(out).toContain('class="sk sk-h1"')
  }

  it('the page skeleton is a head and three boxes', () => {
    shape(html(<PageSkeleton />))
  })

  it("the console and the Platform show it while a page loads", () => {
    shape(html(<ConsoleLoading />))
    shape(html(<AdminLoading />))
  })
})

// Notification settings save on the flip with no toast (ADV §11); a flip that does not save goes back and says so,
// instead of quietly undoing itself.
describe('savePref', () => {
  it('a saved flip says nothing', async () => {
    takeToast()
    const revert = vi.fn()
    await savePref(async () => undefined, revert)
    expect(revert).not.toHaveBeenCalled()
    expect(getToast()).toBeNull()
  })

  it('a flip that fails goes back and says it did not save', async () => {
    takeToast()
    const revert = vi.fn()
    await savePref(async () => {
      throw new Error('network')
    }, revert)
    expect(revert).toHaveBeenCalledOnce()
    expect(getToast()?.message).toBe(NOTIFICATIONS_PAGE.saveFailed)
  })
})

describe('console.css', () => {
  const css = readFileSync('src/styles/console.css', 'utf8')
  it('dims a submit on its way with the progress cursor, after the plain disabled look so it wins', () => {
    expect(css).toContain('.btn[aria-busy=true],button[aria-busy=true],.cc[aria-busy=true]{opacity:.6;cursor:progress}')
    expect(css.indexOf('.btn[aria-busy=true]')).toBeGreaterThan(css.indexOf('.btn:disabled{opacity:.4'))
  })
  it("draws the skeleton's grey blocks, still for anyone who asks for less motion", () => {
    for (const sel of ['.sk{display:block', '.sk-h1{', '.sk-lead{', '.sk-box .sk-h3{', '.sk-line{', '.sk-short{', '@keyframes sk{'])
      expect(css).toContain(sel)
    expect(css).toContain('@media (prefers-reduced-motion:reduce){.sk{animation:none}}')
  })
})
