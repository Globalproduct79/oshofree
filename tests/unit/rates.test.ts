import { describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import {
  currentCpmCents, currentFx, currentShare, EXPECTED_OPEN_RATE, rateTable, setFx, setRate, setShare,
} from '@/lib/rates'

const DAY = 86_400_000
const setup = async () => {
  const channel = await db.channel.create({ data: { key: 'phoenix', name: 'Phoenix Browser', apiKeyHash: 'x' } })
  const user = await db.user.create({ data: { email: 'a@x.test', name: 'A', passwordHash: 'x', isGlobalAdmin: true } })
  return { channel, user }
}

describe('rates', () => {
  it('current is the latest row not after now; a future row is ignored', async () => {
    const { channel } = await setup()
    const now = Date.now()
    await db.rateCard.createMany({
      data: [
        { channelId: channel.id, country: 'NG', placement: 'card', cpmCents: 120, effectiveFrom: new Date(now - DAY) },
        { channelId: channel.id, country: 'NG', placement: 'card', cpmCents: 180, effectiveFrom: new Date(now + DAY) },
      ],
    })
    expect(await currentCpmCents(channel.id, 'NG', 'card')).toBe(120)
    expect(await currentCpmCents(channel.id, 'NG', 'card', new Date(now + 2 * DAY))).toBe(180)
  })

  it('throws NO_RATE when missing', async () => {
    const { channel } = await setup()
    await expect(currentCpmCents(channel.id, 'KE', 'video')).rejects.toBe('NO_RATE')
  })

  it('setRate inserts a new row, keeps the old one, and audits', async () => {
    const { channel, user } = await setup()
    await db.rateCard.create({
      data: { channelId: channel.id, country: 'NG', placement: 'card', cpmCents: 120, effectiveFrom: new Date(Date.now() - DAY) },
    })
    await setRate(channel.id, 'NG', 'card', 150, user.id)
    expect(await db.rateCard.count()).toBe(2)
    expect(await currentCpmCents(channel.id, 'NG', 'card', new Date(Date.now() + 1000))).toBe(150)
    expect(await db.auditEvent.count({ where: { action: 'rate.set', targetType: 'RateCard' } })).toBe(1)
  })

  it('rateTable has a row per country with a cell per placement; missing is null', async () => {
    const { channel } = await setup()
    await db.rateCard.create({
      data: { channelId: channel.id, country: 'GH', placement: 'video', cpmCents: 480, effectiveFrom: new Date(Date.now() - DAY) },
    })
    const rows = await rateTable(channel.id, new Date())
    expect(rows.map((r) => r.country)).toEqual(['NG', 'KE', 'GH', 'TZ', 'SN'])
    expect(rows[2].cpmCents).toEqual({ card: null, featured: null, video: 480, splash: null })
  })

  it('fx: latest wins, setFx audits, missing throws NO_FX', async () => {
    const { user } = await setup()
    await expect(currentFx('NG')).rejects.toBe('NO_FX')
    await db.marketFx.create({ data: { country: 'NG', fxPerUsd: 1500, effectiveFrom: new Date(Date.now() - DAY) } })
    await setFx('NG', 1550, user.id)
    expect(await currentFx('NG', new Date(Date.now() + 1000))).toBe(1550)
    expect(await db.auditEvent.count({ where: { action: 'fx.set' } })).toBe(1)
  })

  it('share defaults to 0.55, setShare validates 0..1 and audits', async () => {
    const { channel, user } = await setup()
    expect(await currentShare(channel.id)).toBe(0.55)
    await expect(setShare(channel.id, 1.5, user.id)).rejects.toBe('INVALID')
    await expect(setShare(channel.id, -0.1, user.id)).rejects.toBe('INVALID')
    await setShare(channel.id, 0.6, user.id)
    expect(await currentShare(channel.id, new Date(Date.now() + 1000))).toBe(0.6)
    expect(await db.auditEvent.count({ where: { action: 'share.set' } })).toBe(1)
  })

  it('expected open rates', () => {
    expect(EXPECTED_OPEN_RATE).toEqual({ card: 0.036, featured: 0.055, video: 0.07, splash: 0.09 })
  })
})
