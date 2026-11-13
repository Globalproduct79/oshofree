import type { LinkEventType } from '@prisma/client'
import { db } from '@/lib/db'
import { mintChannelLink, mintConsumerLink, mintRootLink } from '@/lib/links'
import { upsertConsumer } from '@/lib/consumers'

const DAY = 24 * 60 * 60 * 1000

// Root -> 3 channel links -> 2 consumer links under the first -> 1 under Ada's (depth 3).
export async function seedShareChain(campaignId: string, channelId: string, now: Date) {
  await mintRootLink(campaignId, channelId)
  const c1 = await mintChannelLink(campaignId, channelId, 'seed-sharer-1', 'whatsapp')
  const c2 = await mintChannelLink(campaignId, channelId, 'seed-sharer-2', 'whatsapp')
  const c3 = await mintChannelLink(campaignId, channelId, 'seed-sharer-3', 'sms')
  const ada = await upsertConsumer('+2348031234567', 'NG', 'Ada')
  const bolu = await upsertConsumer('+2348052223344', 'NG', 'Bolu')
  const chidi = await upsertConsumer('+2348098887766', 'NG', 'Chidi')
  const adaLink = await mintConsumerLink(c1.id, ada.id)
  const boluLink = await mintConsumerLink(c1.id, bolu.id)
  const chidiLink = await mintConsumerLink(adaLink.id, chidi.id)

  let v = 0
  let k = 0
  const rows: { linkId: string; type: LinkEventType; visitorId: string; at: Date }[] = []
  const at = () => new Date(now.getTime() - (1 + (k++ % 6)) * DAY + k * 3 * 60 * 1000)
  const add = (linkId: string, type: LinkEventType) => rows.push({ linkId, type, visitorId: `seed-v-${++v}`, at: at() })
  for (const l of [c1, c2, c3]) for (let i = 0; i < 2; i++) add(l.id, 'Open')
  for (const l of [adaLink, boluLink, chidiLink]) for (let i = 0; i < 3; i++) add(l.id, 'Open')
  add(c1.id, 'DetailsLeft')
  add(adaLink.id, 'DetailsLeft')
  add(adaLink.id, 'Claim')
  add(c2.id, 'Claim')
  await db.linkEvent.createMany({ data: rows.map((r) => ({ ...r, ipHash: 'seed-ip', userAgent: 'seed' })) })
  return { links: 7, linkEvents: rows.length }
}
