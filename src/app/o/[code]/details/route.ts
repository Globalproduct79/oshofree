import { normalisePhone, upsertConsumer } from '@/lib/consumers'
import { recordDetails } from '@/lib/link-events'
import { ended, html, landingRoute, liveLink } from '@/lib/landing/respond'
import { phoneError, viaLinks, viewFor } from '@/lib/landing/view'
import { visitor } from '@/lib/landing/visitor'
import { linkUrl, mintConsumerLink } from '@/lib/links'

// Share and earn: the friend leaves a number and gets a link of their own, one level down.
export const POST = landingRoute(async (req, code) => {
  const { link, brand } = await liveLink(code)
  if (!link) return ended(brand)
  const form = await req.formData().catch(() => null)
  const field = (name: string) => {
    const value = form?.get(name)
    return typeof value === 'string' ? value : ''
  }
  const country = link.campaign.country
  const phone = normalisePhone(field('phone'), country)
  if (!phone) return html(viewFor(link, 'offer', { error: phoneError(country) }))
  const v = visitor(req)
  const consumer = await upsertConsumer(phone, country, field('name').slice(0, 80))
  const mine = await mintConsumerLink(link.id, consumer.id)
  await recordDetails(link.id, v.id, v.ipHash, v.userAgent)
  const shared = viewFor(link, 'shared', { myUrl: linkUrl(mine.code), shareTargets: viaLinks(mine.code) })
  return html(shared, 200, v.setCookie)
})
