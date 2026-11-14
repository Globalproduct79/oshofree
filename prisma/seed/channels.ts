import { db } from '@/lib/db'
import { hashKey } from '@/lib/channels'
import { COUNTRIES } from '@/lib/markets'

export const DEMO_KEY = process.env.DEMO_CHANNEL_KEY ?? 'phx_dev_oshofree'

// Phoenix Browser (live, every market, the dev key's hash) and Boomplay (not live yet), GLB §2.7.
export async function seedChannels(keyCreatedAt: Date) {
  const phoenix = await db.channel.create({
    data: { key: 'phoenix', name: 'Phoenix Browser', isLive: true, countries: [...COUNTRIES], apiKeyHash: hashKey(DEMO_KEY), keyCreatedAt },
  })
  const boomplay = await db.channel.create({
    data: { key: 'boomplay', name: 'Boomplay', isLive: false, countries: ['NG'], apiKeyHash: hashKey('boomplay_not_issued'), keyCreatedAt },
  })
  return { phoenix, boomplay }
}
