import { db } from '@/lib/db'
import { hashKey } from '@/lib/channels'

export const DEMO_KEY = process.env.DEMO_CHANNEL_KEY ?? 'phx_dev_oshofree'

export async function seedChannels() {
  const phoenix = await db.channel.create({
    data: { key: 'phoenix', name: 'Phoenix Browser', isLive: true, countries: ['NG', 'KE', 'GH', 'TZ', 'SN'], apiKeyHash: hashKey(DEMO_KEY) },
  })
  const boomplay = await db.channel.create({
    data: { key: 'boomplay', name: 'Boomplay', isLive: false, countries: ['NG'], apiKeyHash: hashKey('boomplay_not_issued') },
  })
  return { phoenix, boomplay }
}
