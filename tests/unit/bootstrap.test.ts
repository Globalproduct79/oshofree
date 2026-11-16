import { afterEach, describe, expect, it, vi } from 'vitest'
import { bootstrap, summaryLine } from '@/lib/bootstrap'
import { channelFromRequest, hashKey, rotateKey } from '@/lib/channels'
import { db } from '@/lib/db'
import { COUNTRIES } from '@/lib/markets'
import { currentFx, PLACEMENTS, rateTable, setRate } from '@/lib/rates'
import { CPM_CENTS, FX_PER_USD, PHOENIX_SHARE } from '@/lib/reference-rates'
import { createUser, verifyCredentials } from '@/lib/users'

// The real fraud rules, unless a test makes that step fail (it runs after the channel is created).
const fraud = vi.hoisted(() => ({ fail: false }))
vi.mock('@/lib/fraud', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/fraud')>()
  return {
    ...real,
    ensureFraudRules: async (...args: Parameters<typeof real.ensureFraudRules>) => {
      if (fraud.fail) throw new Error('fraud rules down')
      return real.ensureFraudRules(...args)
    },
  }
})

const NOW = new Date('2026-11-14T09:00:00Z')
const LATER = new Date('2026-11-21T09:00:00Z')
const ENV = { adminEmail: 'Ops@OshoFree.test', adminPassword: 'a long first password' }
const bearer = (key: string) => new Request('http://localhost/api/v1/offers', { headers: { authorization: `Bearer ${key}` } })

// Everything the bootstrap may write, as stored.
async function snapshot() {
  const [users, channels, rates, fx, shares, rules, accounts, audits] = await Promise.all([
    db.user.findMany({ orderBy: { email: 'asc' } }),
    db.channel.findMany({ orderBy: { key: 'asc' } }),
    db.rateCard.findMany({ orderBy: { id: 'asc' } }),
    db.marketFx.findMany({ orderBy: { id: 'asc' } }),
    db.channelShare.findMany({ orderBy: { id: 'asc' } }),
    db.fraudRule.findMany({ orderBy: { key: 'asc' } }),
    db.aggregatorAccount.findMany(),
    db.auditEvent.count(),
  ])
  return { users, channels, rates, fx, shares, rules, accounts, audits }
}

const phoenix = () => db.channel.findUniqueOrThrow({ where: { key: 'phoenix' } })
const audits = (action: string) =>
  db.auditEvent.findMany({ where: { action }, select: { actorId: true, targetType: true, before: true, after: true } })

describe('bootstrap', () => {
  afterEach(() => {
    fraud.fail = false
  })

  it('on an empty database creates the Global user, Phoenix, its rates, FX and share, the fraud rules and the aggregator', async () => {
    const r = await bootstrap(ENV, NOW)
    expect(r.created).toEqual(['Global user', 'Phoenix channel', '20 rates', '5 FX rates', 'Phoenix share', '3 fraud rules', 'aggregator account'])
    expect(r.updated).toEqual([])
    expect(r.there).toEqual([])
    expect(summaryLine(r)).toBe(
      'Bootstrap: created Global user, Phoenix channel, 20 rates, 5 FX rates, Phoenix share, 3 fraud rules, aggregator account; updated nothing; already there nothing.',
    )

    const admin = await verifyCredentials('ops@oshofree.test', ENV.adminPassword)
    expect(admin?.isGlobalAdmin).toBe(true)
    // Only the seed makes demo data (Prompt 9); production's Global user is real.
    expect(admin?.demo).toBe(false)

    // No PHOENIX_CHANNEL_KEY: a key is made, handed back this once, and only its hash is stored.
    expect(r.generatedKey).toMatch(/^phx_live_[0-9A-Za-z]{24}$/)
    const ch = await phoenix()
    expect(ch).toMatchObject({ name: 'Phoenix Browser', isLive: true, apiKeyHash: hashKey(r.generatedKey!), keyCreatedAt: NOW })
    expect([...ch.countries].sort()).toEqual([...COUNTRIES].sort())
    expect((await channelFromRequest(bearer(r.generatedKey!)))?.id).toBe(ch.id)

    expect(await rateTable(ch.id, NOW)).toEqual(
      COUNTRIES.map((country) => ({ country, cpmCents: Object.fromEntries(PLACEMENTS.map((p, i) => [p, CPM_CENTS[country][i]])) })),
    )
    for (const country of COUNTRIES) expect(await currentFx(country, NOW)).toBe(FX_PER_USD[country])
    const shares = await db.channelShare.findMany()
    expect(shares.map((row) => ({ channelId: row.channelId, share: Number(row.share) }))).toEqual([{ channelId: ch.id, share: PHOENIX_SHARE }])
    expect(await db.fraudRule.findMany({ select: { key: true, enabled: true }, orderBy: { key: 'asc' } })).toEqual([
      { key: 'per_sharer_daily', enabled: true }, { key: 'phone_reuse', enabled: true }, { key: 'same_device', enabled: true },
    ])
    expect(await db.aggregatorAccount.findMany()).toEqual([{ id: 'reloadly', balanceCents: 0 }])
  })

  it('a second run creates nothing and changes nothing, the password hash included', async () => {
    await bootstrap(ENV, NOW)
    expect(await audits('user.global')).toEqual([{ actorId: null, targetType: 'User', before: { isGlobalAdmin: false }, after: { isGlobalAdmin: true } }])
    expect(await audits('user.password')).toEqual([])
    const before = await snapshot()
    const r = await bootstrap(ENV, LATER)
    expect(r.created).toEqual([])
    expect(r.updated).toEqual([])
    expect(r.generatedKey).toBeUndefined()
    expect(r.notes).toEqual([])
    expect(summaryLine(r)).toBe(
      'Bootstrap: created nothing; updated nothing; already there Global user, Phoenix channel, 20 rates, 5 FX rates, Phoenix share, 3 fraud rules, aggregator account.',
    )
    expect(await snapshot()).toEqual(before)
    expect(await db.auditEvent.count({ where: { action: { in: ['user.global', 'user.password'] } } })).toBe(1)
  })

  it('hands a key it made over as soon as the channel exists, even when a later step fails', async () => {
    fraud.fail = true
    const shown: string[] = []
    await expect(bootstrap(ENV, NOW, { onGeneratedKey: (key) => shown.push(key) })).rejects.toThrow('fraud rules down')
    expect(shown).toHaveLength(1)
    expect((await phoenix()).apiKeyHash).toBe(hashKey(shown[0]))

    // The rerun finishes the job and never makes or shows another key.
    fraud.fail = false
    const again: string[] = []
    const r = await bootstrap(ENV, LATER, { onGeneratedKey: (key) => again.push(key) })
    expect(again).toEqual([])
    expect(r.generatedKey).toBeUndefined()
    expect(r.created).toEqual(['3 fraud rules', 'aggregator account'])
    expect((await phoenix()).apiKeyHash).toBe(hashKey(shown[0]))
  })

  it('takes the key from PHOENIX_CHANNEL_KEY and hands none back', async () => {
    const r = await bootstrap({ ...ENV, phoenixKey: 'phx_prod_given_key' }, NOW)
    expect(r.generatedKey).toBeUndefined()
    expect((await phoenix()).apiKeyHash).toBe(hashKey('phx_prod_given_key'))
  })

  it("fills only what is missing and keeps Global's own changes, a rotated key included", async () => {
    await bootstrap({ ...ENV, phoenixKey: 'phx_prod_given_key' }, NOW)
    const ch = await phoenix()
    const admin = await db.user.findUniqueOrThrow({ where: { email: 'ops@oshofree.test' } })
    await setRate(ch.id, 'NG', 'card', 999, admin.id, new Date('2026-11-15T09:00:00Z'))
    await db.fraudRule.update({ where: { key: 'phone_reuse' }, data: { enabled: false } })
    await db.rateCard.deleteMany({ where: { country: 'KE', placement: 'video' } })
    await db.marketFx.deleteMany({ where: { country: 'TZ' } })
    // Rotated twice, so the key in the environment no longer works at all.
    await rotateKey(ch.id, admin.id, NOW)
    await rotateKey(ch.id, admin.id, NOW)

    const r = await bootstrap({ ...ENV, phoenixKey: 'phx_prod_given_key' }, LATER)
    expect(r.created).toEqual(['1 rate', '1 FX rate'])
    expect(r.there).toEqual(['Global user', 'Phoenix channel', '19 rates', '4 FX rates', 'Phoenix share', '3 fraud rules', 'aggregator account'])
    expect(r.notes).toEqual([
      "PHOENIX_CHANNEL_KEY is not Phoenix's key now (it was rotated on Platform › Phoenix API?); the channel is left as it is.",
    ])
    expect((await rateTable(ch.id, LATER)).find((row) => row.country === 'NG')!.cpmCents.card).toBe(999)
    expect((await rateTable(ch.id, LATER)).find((row) => row.country === 'KE')!.cpmCents.video).toBe(CPM_CENTS.KE[2])
    expect(await currentFx('TZ', LATER)).toBe(FX_PER_USD.TZ)
    expect((await db.fraudRule.findUniqueOrThrow({ where: { key: 'phone_reuse' } })).enabled).toBe(false)
    expect(await channelFromRequest(bearer('phx_prod_given_key'))).toBeNull()
  })

  it('makes an existing user Global, and a new BOOTSTRAP_ADMIN_PASSWORD replaces the old one', async () => {
    await createUser({ email: 'ops@oshofree.test', password: 'an old password', name: 'Ops' })
    const r = await bootstrap({ ...ENV, adminPassword: 'a brand new password' }, NOW)
    expect(r.updated).toEqual(['Global user (made Global)', 'Global user password'])
    // Audited as the system's, like every bootstrap write; the password change carries no values.
    expect(await audits('user.global')).toEqual([{ actorId: null, targetType: 'User', before: { isGlobalAdmin: false }, after: { isGlobalAdmin: true } }])
    expect(await audits('user.password')).toEqual([{ actorId: null, targetType: 'User', before: null, after: null }])
    expect((await db.user.findUniqueOrThrow({ where: { email: 'ops@oshofree.test' } })).isGlobalAdmin).toBe(true)
    expect(await verifyCredentials('ops@oshofree.test', 'an old password')).toBeNull()
    expect(await verifyCredentials('ops@oshofree.test', 'a brand new password')).not.toBeNull()
  })

  it('without the admin variables, keeps the Global user it finds, and leaves its password alone', async () => {
    await bootstrap(ENV, NOW)
    const before = await snapshot()
    const r = await bootstrap({}, LATER)
    expect(r.there[0]).toBe('Global user')
    expect(await snapshot()).toEqual(before)
  })

  it('refuses before writing anything when there is no Global user to make, or the password is too short', async () => {
    await expect(bootstrap({}, NOW)).rejects.toThrow('Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD: there is no Global user yet.')
    await expect(bootstrap({ adminEmail: 'ops@oshofree.test' }, NOW)).rejects.toThrow(
      'Set BOOTSTRAP_ADMIN_PASSWORD: there is no user ops@oshofree.test to make Global yet.',
    )
    await expect(bootstrap({ adminEmail: 'ops@oshofree.test', adminPassword: 'short' }, NOW)).rejects.toThrow(
      'BOOTSTRAP_ADMIN_PASSWORD must be at least 8 characters.',
    )
    const empty = await snapshot()
    expect([empty.users, empty.channels, empty.rates, empty.fx, empty.shares, empty.rules, empty.accounts]).toEqual([[], [], [], [], [], [], []])
  })
})
