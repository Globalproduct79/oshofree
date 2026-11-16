import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import AdminFailed from '@/app/admin/error'
import AdminNotFound from '@/app/admin/not-found'
import ConsoleFailed from '@/app/app/(console)/error'
import ConsoleNotFound from '@/app/app/(console)/not-found'
import { SHELL } from '@/lib/copy-shell'

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

describe('a page that failed', () => {
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
