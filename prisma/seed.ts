import { pathToFileURL } from 'node:url'
import { db } from '@/lib/db'
import { seedUsers } from './seed/users'
import { DEMO_KEY, seedChannels } from './seed/channels'
import { seedCampaigns } from './seed/campaigns'
import { seedChannelEvents } from './seed/channel-events'
import { seedShareChain } from './seed/share-chain'

// Assumes an empty database (it runs after `migrate reset`); SEED_FORCE=1 skips the guard.
export async function seed(now: Date = new Date()) {
  if (!process.env.SEED_FORCE && (await db.user.count()) > 0) {
    throw new Error('Refusing to seed: users already exist. Reset the database first, or set SEED_FORCE=1.')
  }
  const { admin, kola } = await seedUsers()
  const { phoenix } = await seedChannels()
  const campaigns = await seedCampaigns(kola.id, admin.id, now)
  const events = await seedChannelEvents(campaigns.buy2.id, phoenix.id, now)
  const chain = await seedShareChain(campaigns.buy2.id, phoenix.id, now)
  return {
    users: 3, workspaces: 2, channels: 2, campaigns: 4,
    channelEvents: events.events, channelBatches: events.batches, shareLinks: chain.links + 1, linkEvents: chain.linkEvents,
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  seed()
    .then((counts) => {
      console.log(`Phoenix dev channel key: ${DEMO_KEY}`)
      console.log('Logins (password: password): admin@oshofree.demo, tunde@kolabright.demo, ada@zurifoods.demo')
      console.log('Created:', JSON.stringify(counts))
    })
    .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
    .finally(() => db.$disconnect())
}
