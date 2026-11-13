import { recordClaim, recordOpen } from '@/lib/link-events'
import { ended, html, landingRoute, liveLink, redirect } from '@/lib/landing/respond'
import { brandHref, viewFor } from '@/lib/landing/view'
import { isPreviewFetcher, visitor } from '@/lib/landing/visitor'

// The consumer landing page. ?go=claim is the Phoenix click-through for link offers:
// it logs a Claim and no Open, then hands the visitor to the brand.
export const GET = landingRoute(async (req, code) => {
  const { link, brand } = await liveLink(code)
  if (!link) return ended(brand)
  const target = new URL(req.url).searchParams.get('go') === 'claim' ? brandHref(link.campaign) : null
  // A link preview (WhatsApp, Slack, X…) gets the same answer, with no cookie and nothing counted.
  if (isPreviewFetcher(req.headers.get('user-agent'))) return target ? redirect(target) : html(viewFor(link, 'offer'))
  const v = visitor(req)
  if (target) {
    await recordClaim(link.id, v.id, v.ipHash, v.userAgent)
    return redirect(target, v.setCookie)
  }
  await recordOpen(link.id, v.id, v.ipHash, v.userAgent)
  return html(viewFor(link, 'offer'), 200, v.setCookie)
})
