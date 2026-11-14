import { pathToFileURL } from 'node:url'
import { db } from '@/lib/db'
import { prng } from './seed/prng'
import { placeCreatives, planCampaigns } from './seed/campaigns'
import { DEMO_KEY, seedChannels } from './seed/channels'
import { planHistory, seedScale } from './seed/events'
import { planEarlierMoney, settleLastMonth } from './seed/money'
import { invoiceNotices, readOlder } from './seed/notifications'
import { seedRates } from './seed/rates'
import { makeClock, Stamper, Timeline } from './seed/timeline'
import { LOGINS, PASSWORD, seedUsers } from './seed/users'
import { seedWorkspaces } from './seed/workspaces'

// The prototype's world (spec §6.13): four workspaces and their people, the rate card, nine campaigns and
// their history, invoices and the bell — every date relative to `now`, every number from the real pipeline
// (spec §6.14.5). A pure function of `now` (and SEED_SCALE): one seeded RNG drives every random choice.
//
// Assumes an empty database (it runs after `migrate reset`); SEED_FORCE=1 skips the guard.
export const SEED = 20261113

export type SeedOptions = { scale?: number }

export async function seed(now: Date = new Date(), opts: SeedOptions = {}) {
  if (!process.env.SEED_FORCE && (await db.user.count()) > 0) {
    throw new Error('Refusing to seed: users already exist. Reset the database first, or set SEED_FORCE=1.')
  }
  const started = Date.now()
  const scale = opts.scale ?? seedScale()
  const rng = prng(SEED)
  const clock = makeClock(now)
  const stamp = new Stamper()
  const setUp = clock.utc(-120, 9)

  const people = await stamp.at(setUp, () => seedUsers())
  const { phoenix } = await stamp.at(setUp, async () => {
    const channels = await seedChannels(setUp)
    await seedRates(channels.phoenix.id, people.admin.id, setUp)
    return channels
  })
  await placeCreatives()
  const workspaces = await seedWorkspaces(people, clock, stamp)

  const timeline = new Timeline(now, stamp)
  planEarlierMoney(timeline, workspaces, people, clock)
  const made = planCampaigns(timeline, workspaces, people, clock)
  const history = planHistory(timeline, made, people, phoenix.id, clock, rng, scale)
  await timeline.run()
  if (history.jobErrors.length) throw new Error(`The daily job reported errors:\n${history.jobErrors.join('\n')}`)

  await settleLastMonth(workspaces, people, clock, stamp)
  await invoiceNotices(clock, stamp)
  await readOlder(clock)
  return summary(scale, history.days, Date.now() - started)
}

async function summary(scale: number, days: number, ms: number) {
  const [users, workspaces, campaigns, rateRows, channels, impressions, payouts, invoices, ledgerLines, notifications] = await Promise.all([
    db.user.count(),
    db.workspace.count(),
    db.campaign.groupBy({ by: ['status'], _count: { _all: true } }),
    db.rateCard.count(),
    db.channel.count(),
    db.channelEvent.count({ where: { type: 'Impression' } }),
    db.rewardPayout.groupBy({ by: ['status'], _count: { _all: true } }),
    db.invoice.findMany({ orderBy: { number: 'asc' }, select: { number: true } }),
    db.ledgerEntry.count(),
    db.notification.count(),
  ])
  const byStatus = (rows: { status: string; _count: { _all: number } }[]) =>
    Object.fromEntries(rows.map((r) => [r.status, r._count._all]).sort())
  return {
    scale,
    users,
    workspaces,
    campaigns: campaigns.reduce((n, r) => n + r._count._all, 0),
    campaignStatuses: byStatus(campaigns),
    channels,
    rateRows,
    daysReplayed: days,
    impressions,
    payouts: byStatus(payouts),
    invoices: invoices.map((i) => i.number),
    ledgerLines,
    notifications,
    seconds: Math.round(ms / 100) / 10,
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  seed()
    .then((counts) => {
      console.log(`Phoenix dev channel key: ${DEMO_KEY}`)
      console.log(`Logins (password: ${PASSWORD}):`)
      for (const l of LOGINS) console.log(`  ${l.email.padEnd(24)} ${l.shows}`)
      console.log('Created:', JSON.stringify(counts))
    })
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e)
      process.exitCode = 1
    })
    .finally(() => db.$disconnect())
}
