import { issueClaimCode } from '@/lib/claims'
import { recordClaim } from '@/lib/link-events'
import { ended, html, landingRoute, liveLink, redirect } from '@/lib/landing/respond'
import { brandHref, viewFor } from '@/lib/landing/view'
import { visitor } from '@/lib/landing/visitor'

// "Show my code" / "Open offer": either way the friend's claim is a real event. A code offer shows the
// visitor's own claim code, one per visitor per offer per UTC day on the link's channel (spec §6.7).
export const POST = landingRoute(async (req, code) => {
  const { link, brand } = await liveLink(code)
  if (!link) return ended(brand)
  const v = visitor(req)
  const target = brandHref(link.campaign)
  await recordClaim(link.id, v.id, v.ipHash, v.userAgent)
  if (target) return redirect(target, v.setCookie)
  const issued = await issueClaimCode(link.campaignId, link.channelId, v.id)
  return html(viewFor(link, 'code', { claimCode: issued.code }), 200, v.setCookie)
})
