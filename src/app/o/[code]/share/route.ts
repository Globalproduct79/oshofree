import type { ShareVia } from '@prisma/client'
import { COPY } from '@/lib/copy'
import { ended, landingRoute, liveLink, redirect } from '@/lib/landing/respond'
import { shareTargets } from '@/lib/landing/share-targets'
import { linkUrl, setLinkVia } from '@/lib/links'

const MEDIA = ['whatsapp', 'sms', 'x'] as const

// Redirect-through share button: store the medium on the sharer's own link, then hand off.
// Only Consumer links take a medium from here; Phoenix set the Channel link's medium itself.
export const GET = landingRoute(async (req, code) => {
  const { link, brand } = await liveLink(code)
  if (!link) return ended(brand)
  const asked = new URL(req.url).searchParams.get('via')
  const medium = MEDIA.find((m) => m === asked)
  const via: ShareVia = medium ?? 'other'
  if (link.sharerType === 'Consumer') await setLinkVia(link.id, via)
  const url = linkUrl(link.code)
  const c = link.campaign
  return redirect(medium ? shareTargets(url, COPY.landing.title(c.brand, c.headline))[medium] : url)
})
