import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import AdminFailed from '@/app/admin/error'
import AdminNotFound from '@/app/admin/not-found'
import ConsoleFailed from '@/app/app/(console)/error'
import ConsoleNotFound from '@/app/app/(console)/not-found'
import RootNotFound from '@/app/not-found'
import { retryPage } from '@/components/shell/PageProblem'
import { SHELL } from '@/lib/copy-shell'

// The failed box asks the router for a refresh; there is no app router mounted in a server render.
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

const P = SHELL.problem
const text = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/&#x27;/g, "'").trim()

// Prompt 10's sweep: a page that is not there, or that fails, was Next's bare screen with no way on. Inside the console
// and Platform it is now a box in the shell (the layout stays, so the sidebar does too) with the way back.
describe('a page that is not there', () => {
  it('in the console: says so, and leads back to Campaigns', () => {
    const markup = renderToStaticMarkup(<ConsoleNotFound />)
    expect(markup).toContain('class="box empty"')
    expect(text(markup)).toBe(`${P.notHere.title} ${P.notHere.line} ${P.toCampaigns}`)
    expect(markup).toContain(`<a class="btn p" href="/app">${P.toCampaigns}</a>`)
  })

  it('on Platform: leads back to Review', () => {
    const markup = renderToStaticMarkup(<AdminNotFound />)
    expect(markup).toContain(`<a class="btn p" href="/admin/review">${P.toReview}</a>`)
  })
})

// Fix round 1: an address that matches no page at all gets the product's box, not Next's bare 404 (no shell there).
describe('an address that matches no page', () => {
  it('says so in the design system, with the way to the start', () => {
    const markup = renderToStaticMarkup(<RootNotFound />)
    expect(markup.startsWith('<main class="wrap"><div class="box empty">')).toBe(true)
    expect(text(markup)).toBe(`${P.notHere.title} ${P.notHere.line} ${P.toStart}`)
    expect(markup).toContain(`<a class="btn p" href="/">${P.toStart}</a>`)
  })
})

describe('a page that failed', () => {
  // Fix round 1: reset() alone redraws the same failed server answer (Next 15), so Try again does nothing for a page that
  // failed on the server. It asks the server again and resets the boundary, in that order, inside one transition.
  it('Try again refreshes from the server and resets, inside one transition', () => {
    const calls: string[] = []
    let inTransition = false
    retryPage(
      () => calls.push(`refresh${inTransition ? ' in transition' : ''}`),
      () => calls.push(`reset${inTransition ? ' in transition' : ''}`),
      (fn) => {
        inTransition = true
        fn()
        inTransition = false
      },
    )
    expect(calls).toEqual(['refresh in transition', 'reset in transition'])
  })

  const error = Object.assign(new Error('boom'), { digest: 'x' })
  it('in the console: says so, with Try again and the way back, and never the error itself', () => {
    const markup = renderToStaticMarkup(<ConsoleFailed error={error} reset={() => {}} />)
    expect(text(markup)).toBe(`${P.failed.title} ${P.failed.line} ${P.failed.retry} ${P.toCampaigns}`)
    expect(markup).toContain(`<button class="btn p" type="button">${P.failed.retry}</button>`)
    expect(markup).toContain(`<a class="btn g" href="/app">${P.toCampaigns}</a>`)
    expect(markup).not.toContain('boom')
  })

  it('on Platform: leads back to Review', () => {
    const markup = renderToStaticMarkup(<AdminFailed error={error} reset={() => {}} />)
    expect(markup).toContain(`<a class="btn g" href="/admin/review">${P.toReview}</a>`)
  })
})
