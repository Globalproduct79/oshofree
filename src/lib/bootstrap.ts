import { audit, SYSTEM_ACTOR } from '@/lib/audit'
import { hashKey, newChannelKey } from '@/lib/channels'
import { db } from '@/lib/db'
import { ensureFraudRules, FRAUD_RULES } from '@/lib/fraud'
import { COUNTRIES } from '@/lib/markets'
import { PLACEMENTS, setFx, setRate, setShare } from '@/lib/rates'
import { CPM_CENTS, FX_PER_USD, PHOENIX_SHARE } from '@/lib/reference-rates'
import { AGGREGATOR_ID } from '@/lib/rewards'
import { createUser, hashPassword, MIN_PASSWORD_LENGTH, verifyCredentials } from '@/lib/users'

// What a production database needs before anyone signs in; on a demo machine the seed builds all of it and more.
// `npm run bootstrap` runs it on every deploy, after `prisma migrate deploy`. Each step creates what is missing and
// leaves what is there, so Global's own changes (rates, FX, the share, fraud toggles, a rotated key) survive a
// rerun. Rows it writes are the system's (a null audit actor). Nothing here may import `server-only`: the script
// runs under tsx.

export type BootstrapEnv = { adminEmail?: string; adminPassword?: string; phoenixKey?: string }

export type BootstrapResult = {
  created: string[]
  updated: string[]
  there: string[]
  // Things the operator should know; never a credential.
  notes: string[]
  // The Phoenix key this run made, when PHOENIX_CHANNEL_KEY was unset and there was no channel. Shown once.
  generatedKey?: string
}

const PHOENIX = 'phoenix'
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const text = (v: string | undefined) => v?.trim() || undefined

export async function bootstrap(env: BootstrapEnv, now: Date = new Date()): Promise<BootstrapResult> {
  const r: BootstrapResult = { created: [], updated: [], there: [], notes: [] }
  const admin = await adminPlan(env)
  await ensureAdmin(admin, r)
  const channelId = await ensurePhoenix(text(env.phoenixKey), now, r)
  await ensureRates(channelId, now, r)
  await ensureFraud(r)
  const { count: made } = await db.aggregatorAccount.createMany({ data: [{ id: AGGREGATOR_ID, balanceCents: 0 }], skipDuplicates: true })
  ;(made ? r.created : r.there).push('aggregator account')
  return r
}

// "Bootstrap: created …; updated …; already there …." — names and counts only.
export function summaryLine(r: BootstrapResult): string {
  const list = (xs: string[]) => (xs.length ? xs.join(', ') : 'nothing')
  return `Bootstrap: created ${list(r.created)}; updated ${list(r.updated)}; already there ${list(r.there)}.`
}

type AdminPlan = { kind: 'keep' } | { kind: 'ensure'; email: string; password?: string }

// Checked before anything is written: a run that cannot make a Global user changes nothing.
async function adminPlan(env: BootstrapEnv): Promise<AdminPlan> {
  const email = text(env.adminEmail)?.toLowerCase()
  const password = env.adminPassword || undefined
  if (password !== undefined && password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`BOOTSTRAP_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`)
  }
  if (!email) {
    if (await db.user.count({ where: { isGlobalAdmin: true } })) return { kind: 'keep' }
    throw new Error('Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD: there is no Global user yet.')
  }
  if (!password && !(await db.user.findUnique({ where: { email } }))) {
    throw new Error(`Set BOOTSTRAP_ADMIN_PASSWORD: there is no user ${email} to make Global yet.`)
  }
  return { kind: 'ensure', email, password }
}

// The Global user: created, or made Global, or given the password the environment now names. The hash is only
// rewritten when that password no longer matches, so an unchanged variable changes nothing.
async function ensureAdmin(plan: AdminPlan, r: BootstrapResult): Promise<void> {
  if (plan.kind === 'keep') return void r.there.push('Global user')
  const { email, password } = plan
  const user = await db.user.findUnique({ where: { email } })
  if (!user) {
    const made = await createUser({ email, password: password!, name: 'Global Admin' })
    await db.user.update({ where: { id: made.id }, data: { isGlobalAdmin: true } })
    return void r.created.push('Global user')
  }
  const changed: string[] = []
  if (!user.isGlobalAdmin) {
    await db.user.update({ where: { id: user.id }, data: { isGlobalAdmin: true } })
    changed.push('Global user (made Global)')
  }
  if (password && !(await verifyCredentials(email, password))) {
    await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } })
    changed.push('Global user password')
  }
  if (changed.length) r.updated.push(...changed)
  else r.there.push('Global user')
}

// Phoenix Browser, live in every market. An existing channel is never touched: its key may have been rotated.
async function ensurePhoenix(envKey: string | undefined, now: Date, r: BootstrapResult): Promise<string> {
  const found = await db.channel.findUnique({ where: { key: PHOENIX } })
  if (found) {
    r.there.push('Phoenix channel')
    const hash = envKey && hashKey(envKey)
    const answers = hash === found.apiKeyHash || (hash === found.previousKeyHash && (found.previousKeyValidUntil ?? now) > now)
    if (hash && !answers) {
      r.notes.push("PHOENIX_CHANNEL_KEY is not Phoenix's key now (it was rotated on Platform › Phoenix API?); the channel is left as it is.")
    }
    return found.id
  }
  const key = envKey ?? newChannelKey()
  const ch = await db.channel.create({
    data: { key: PHOENIX, name: 'Phoenix Browser', isLive: true, countries: [...COUNTRIES], apiKeyHash: hashKey(key), keyCreatedAt: now },
  })
  await audit(SYSTEM_ACTOR, 'channel.create', { type: 'Channel', id: ch.id }, undefined, { key: PHOENIX, isLive: true })
  r.created.push('Phoenix channel')
  if (!envKey) r.generatedKey = key
  return ch.id
}

// The reference rate for every market and placement with no rate row, each market's FX where it has none, and the
// share if Phoenix has none — effective now, through the Rates page's own setters.
async function ensureRates(channelId: string, now: Date, r: BootstrapResult): Promise<void> {
  let rates = 0
  let ratesThere = 0
  for (const country of COUNTRIES) {
    for (const [i, placement] of PLACEMENTS.entries()) {
      if (await db.rateCard.findFirst({ where: { channelId, country, placement }, select: { id: true } })) ratesThere++
      else {
        await setRate(channelId, country, placement, CPM_CENTS[country][i], SYSTEM_ACTOR, now)
        rates++
      }
    }
  }
  let fx = 0
  let fxThere = 0
  for (const country of COUNTRIES) {
    if (await db.marketFx.findFirst({ where: { country }, select: { id: true } })) fxThere++
    else {
      await setFx(country, FX_PER_USD[country], SYSTEM_ACTOR, now)
      fx++
    }
  }
  const shareThere = !!(await db.channelShare.findFirst({ where: { channelId }, select: { id: true } }))
  if (!shareThere) await setShare(channelId, PHOENIX_SHARE, SYSTEM_ACTOR, now)

  if (rates) r.created.push(count(rates, 'rate', 'rates'))
  if (fx) r.created.push(count(fx, 'FX rate', 'FX rates'))
  if (!shareThere) r.created.push('Phoenix share')
  if (ratesThere) r.there.push(count(ratesThere, 'rate', 'rates'))
  if (fxThere) r.there.push(count(fxThere, 'FX rate', 'FX rates'))
  if (shareThere) r.there.push('Phoenix share')
}

// The rewards ledger's three checks, on; a rerun keeps Global's toggles.
async function ensureFraud(r: BootstrapResult): Promise<void> {
  const keys = FRAUD_RULES.map((f) => f.key)
  const there = await db.fraudRule.count({ where: { key: { in: keys } } })
  await ensureFraudRules()
  if (keys.length - there) r.created.push(count(keys.length - there, 'fraud rule', 'fraud rules'))
  if (there) r.there.push(count(there, 'fraud rule', 'fraud rules'))
}
