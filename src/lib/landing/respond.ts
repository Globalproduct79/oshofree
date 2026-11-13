import { effectiveStatus } from '@/lib/campaign-status'
import { type LandingView, renderLanding } from '@/lib/landing/render'
import { endedView, errorView, type LinkWithCampaign } from '@/lib/landing/view'
import { linkByCode } from '@/lib/links'

type Context = { params: Promise<{ code: string }> }

// private: a shared cache never holds a visitor's cookie or link. no-cache, not no-store, so the
// back button returns to a posted page from the browser's cache instead of asking to resubmit it.
export function html(view: LandingView, status = 200, setCookie?: string): Response {
  const headers = new Headers({ 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-cache' })
  if (setCookie) headers.set('set-cookie', setCookie)
  return new Response(renderLanding(view), { status, headers })
}

export function redirect(location: string, setCookie?: string): Response {
  const headers = new Headers({ location, 'cache-control': 'no-store' })
  if (setCookie) headers.set('set-cookie', setCookie)
  return new Response(null, { status: 302, headers })
}

export const ended = (brand?: string) => html(endedView(brand), 410)

// The link, only while its campaign is delivering; otherwise the brand to name on the 410 page.
export async function liveLink(code: string, now = new Date()): Promise<
  { link: LinkWithCampaign; brand?: undefined } | { link: null; brand?: string }
> {
  const link = await linkByCode(code)
  if (!link) return { link: null }
  const live = effectiveStatus(link.campaign, now) === 'live' && link.campaign.workspace.status === 'approved'
  return live ? { link } : { link: null, brand: link.campaign.brand }
}

// Every /o route answers with a page, even when something breaks underneath.
export function landingRoute(handler: (req: Request, code: string) => Promise<Response>) {
  return async (req: Request, { params }: Context): Promise<Response> => {
    // Next answers HEAD with GET; a preview bot's or link checker's probe is not a visit.
    if (req.method === 'HEAD') return new Response(null, { status: 204 })
    try {
      return await handler(req, (await params).code)
    } catch (e) {
      console.error(e)
      return html(errorView(), 500)
    }
  }
}
