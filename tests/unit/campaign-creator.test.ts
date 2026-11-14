import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createCampaign, type CampaignInput } from '@/lib/campaigns'
import { db } from '@/lib/db'

// A campaign names the person who created it (Campaign.createdById, Prompt 6): a nullable column with its index
// and a foreign key to User, added by a hand-authored migration that leaves rows from before it NULL.

const MIGRATIONS = path.join(process.cwd(), 'prisma', 'migrations')
const dir = readdirSync(MIGRATIONS).find((d) => d.endsWith('_campaign_created_by'))
const sql = dir ? readFileSync(path.join(MIGRATIONS, dir, 'migration.sql'), 'utf8') : ''
// The statements only, without the comments that explain them.
const statements = sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim()

const input: CampaignInput = {
  name: 'Harmattan Sale', brand: 'Acme Foods', country: 'NG', category: 'Food & drink', headline: 'Buy one, get one free',
  description: 'Show the code at any Acme outlet to get a free second item.', placement: 'card', redeemMethod: 'code',
  budgetUsd: 50, startsAt: '2026-12-01', runsForDays: 14, tileColor: '#FF5A1F', rewardLocal: 50, termsAccepted: true,
}

const mkUser = (name: string, email: string) => db.user.create({ data: { email, name, passwordHash: 'x' } })
const mkWorkspace = () => db.workspace.create({ data: { name: 'Acme', type: 'Brand', country: 'NG' } })

describe('the campaign_created_by migration', () => {
  it('is the newest migration, after the slice-2 ones', () => {
    const all = readdirSync(MIGRATIONS).filter((d) => /^\d{14}_/.test(d)).sort()
    expect(dir).toMatch(/^20261115\d{6}_campaign_created_by$/)
    expect(all.at(-1)).toBe(dir)
  })

  it('adds a nullable column, its index and a foreign key that lets a user go without losing the campaign', () => {
    expect(statements).toContain('ALTER TABLE "Campaign" ADD COLUMN "createdById" TEXT;')
    expect(statements).toContain('CREATE INDEX "Campaign_createdById_idx" ON "Campaign"("createdById");')
    expect(statements).toContain(
      'ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;',
    )
  })

  it('backfills nothing: a campaign from before it has no creator', () => {
    const each = statements.split(';').map((st) => st.trim()).filter(Boolean)
    expect(each.map((st) => st.split(' ').slice(0, 2).join(' '))).toEqual(['ALTER TABLE', 'CREATE INDEX', 'ALTER TABLE'])
    expect(statements).not.toMatch(/NOT NULL/i)
  })

  it('is applied to the database: createdById is a nullable text column', async () => {
    const cols = await db.$queryRaw<{ data_type: string; is_nullable: string }[]>`
      SELECT data_type, is_nullable FROM information_schema.columns WHERE table_name = 'Campaign' AND column_name = 'createdById'`
    expect(cols).toEqual([{ data_type: 'text', is_nullable: 'YES' }])
  })
})

describe('createCampaign stamps its creator', () => {
  it('records who created it and when', async () => {
    const ws = await mkWorkspace()
    const ada = await mkUser('Ada Eze', 'ada@x.test')
    const at = new Date('2026-11-14T09:30:00Z')
    const c = await createCampaign(ws.id, input, ada.id, at)
    expect(c).toMatchObject({ createdById: ada.id, createdAt: at, status: 'draft' })
    const read = await db.campaign.findUniqueOrThrow({ where: { id: c.id }, include: { createdBy: { select: { name: true } } } })
    expect(read.createdBy?.name).toBe('Ada Eze')
  })

  it('dates it now when no time is given', async () => {
    const ws = await mkWorkspace()
    const ada = await mkUser('Ada Eze', 'ada@x.test')
    const before = Date.now()
    const c = await createCampaign(ws.id, input, ada.id)
    expect(c.createdAt.getTime()).toBeGreaterThanOrEqual(before - 1000)
    expect(c.createdAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000)
  })

  it('keeps the campaign when its creator is deleted, with no creator named', async () => {
    const ws = await mkWorkspace()
    const gone = await mkUser('Gone', 'gone@x.test')
    const c = await createCampaign(ws.id, input, gone.id)
    await db.user.delete({ where: { id: gone.id } })
    expect((await db.campaign.findUniqueOrThrow({ where: { id: c.id } })).createdById).toBeNull()
  })

  it('lists the campaigns a user created', async () => {
    const ws = await mkWorkspace()
    const ada = await mkUser('Ada Eze', 'ada@x.test')
    const tunde = await mkUser('Tunde Okafor', 'tunde@x.test')
    const mine = await createCampaign(ws.id, input, ada.id)
    await createCampaign(ws.id, { ...input, name: 'Other' }, tunde.id)
    const created = await db.user.findUniqueOrThrow({ where: { id: ada.id }, include: { campaignsCreated: { select: { id: true } } } })
    expect(created.campaignsCreated).toEqual([{ id: mine.id }])
  })
})
