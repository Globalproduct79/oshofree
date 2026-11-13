import { describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { seed } from '../../prisma/seed'
import { effectiveStatus } from '@/lib/campaign-status'
import { homeNumbers } from '@/lib/reports'

describe('seed', () => {
  it('builds a living demo and refuses a database that has users', async () => {
    const now = new Date()
    const counts = await seed(now)
    expect(counts).toMatchObject({ users: 3, workspaces: 2, channels: 2, campaigns: 4 })
    expect(await db.user.count()).toBe(3)
    expect(await db.workspace.count()).toBe(2)
    expect(await db.channel.count()).toBe(2)
    const campaigns = await db.campaign.findMany()
    const status = Object.fromEntries(campaigns.map((c) => [c.name, effectiveStatus(c, now)]))
    expect(status).toEqual({
      'Buy 2 get 1': 'live', 'Weekend cashback': 'review', 'December draw teaser': 'scheduled', 'August multipack': 'ended',
    })
    expect((await db.shareLink.aggregate({ _max: { depth: true } }))._max.depth).toBe(3)
    const days = await db.$queryRaw<{ n: number }[]>`SELECT count(DISTINCT date_trunc('day', "at"))::int AS n FROM "ChannelEvent"`
    expect(days[0].n).toBe(14)
    const buy2 = campaigns.find((c) => c.name === 'Buy 2 get 1')!
    const home = await homeNumbers(buy2.id, now)
    expect(home.claims).toBeGreaterThan(0)
    expect(home.impressions).toBeGreaterThanOrEqual(14 * 80)
    await expect(seed(now)).rejects.toThrow(/Refusing to seed/)
  })
})
