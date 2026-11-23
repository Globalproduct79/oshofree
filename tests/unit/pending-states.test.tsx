import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { pendingState, SubmitButton } from '@/components/og/SubmitButton'
import { savePref } from '@/app/app/(console)/notifications/PrefsClient'
import { entersOnClick } from '@/components/platform/EnterCampaignCards'
import { getToast, takeToast } from '@/components/shell/toast-store'
import { NOTIFICATIONS_PAGE } from '@/lib/copy-notifications-page'

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
})

// Fix round 1: every submit button in the app shows it is on its way. SubmitButton does it for a form with an action;
// a form driven by onSubmit and a transition puts aria-busy on its own button. A new raw submit without either fails.
describe('every submit button', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
      const p = path.join(dir, d.name)
      return d.isDirectory() ? files(p) : p.endsWith('.tsx') ? [p] : []
    })
  it('is a SubmitButton or carries aria-busy', () => {
    const raw: string[] = []
    for (const f of files('src')) {
      const src = readFileSync(f, 'utf8')
      for (let at = src.indexOf('type="submit"'); at >= 0; at = src.indexOf('type="submit"', at + 1)) {
        const start = src.lastIndexOf('<', at)
        const tag = src.slice(start, src.indexOf('>', at) + 1)
        if (!tag.includes('aria-busy')) raw.push(`${f}: ${tag.replace(/\s+/g, ' ').slice(0, 80)}`)
      }
    }
    expect(raw).toEqual([])
  })
})

// Fix round 1: a Live now card's plain click enters its workspace; any click that asks for a new tab or window is left
// to the browser, which opens the card's own address (its advertiser's Platform page).
describe('entersOnClick', () => {
  const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }
  it('a plain left click enters', () => expect(entersOnClick(click)).toBe(true))
  it('a click with a modifier, or another button, is the browser\'s', () => {
    for (const k of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey'] as const) expect(entersOnClick({ ...click, [k]: true })).toBe(false)
    expect(entersOnClick({ ...click, button: 1 })).toBe(false)
  })
})
