import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { campaignDates } from '@/lib/campaign-schema'
import {
  approveCampaign, approveRevision, createCampaign, editOffer, rejectCampaign, submitCampaign, type CampaignInput, type OfferFields,
} from '@/lib/campaigns'
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
  // Later prompts add their own migrations after it (Prompt 9's demo flags), so it need not stay the newest.
  it('comes after the slice-2 ones', () => {
    const all = readdirSync(MIGRATIONS).filter((d) => /^\d{14}_/.test(d)).sort()
    expect(dir).toMatch(/^20261115\d{6}_campaign_created_by$/)
    expect(all.indexOf(dir!)).toBeGreaterThan(all.indexOf('20261114160000_invoice_country'))
    expect(all.indexOf('20261114160000_invoice_country')).toBeGreaterThan(-1)
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

describe('a campaign keeps its creator', () => {
  const NOW = new Date('2026-11-14T09:00:00Z')
  const DAY = 86_400_000

  // Acme in Nigeria with Ada (who creates) and Tunde (who changes it afterwards), Global, and Phoenix's card rate.
  async function world() {
    const ws = await db.workspace.create({ data: { name: 'Acme', type: 'Brand', country: 'NG', status: 'approved', creditLimitCents: 150_000 } })
    const ada = await mkUser('Ada Eze', 'ada@x.test')
    const tunde = await mkUser('Tunde Okafor', 'tunde@x.test')
    await db.workspaceMember.createMany({ data: [{ userId: tunde.id, workspaceId: ws.id, role: 'Owner' }, { userId: ada.id, workspaceId: ws.id, role: 'Manager' }] })
    const admin = await db.user.create({ data: { email: 'g@x.test', name: 'Global', passwordHash: 'x', isGlobalAdmin: true } })
    const phoenix = await db.channel.create({ data: { key: 'phoenix', name: 'Phoenix', apiKeyHash: 'x', isLive: true } })
    const from = new Date(NOW.getTime() - 30 * DAY)
    await db.rateCard.create({ data: { channelId: phoenix.id, country: 'NG', placement: 'card', cpmCents: 120, effectiveFrom: from } })
    await db.marketFx.create({ data: { country: 'NG', fxPerUsd: 1550, effectiveFrom: from } })
    return { ws, ada, tunde, admin }
  }

  const creator = async (id: string) => (await db.campaign.findUniqueOrThrow({ where: { id } })).createdById

  it('through a rejection, a resubmission, an edit in place, approval and a revised offer by someone else', async () => {
    const { ws, ada, tunde, admin } = await world()
    const c = await createCampaign(ws.id, input, ada.id, NOW)
    await submitCampaign(c.id, ada.id, NOW)
    await rejectCampaign(c.id, admin.id, 'misleading_terms', 'Say where.', NOW)
    // Tunde resubmits it as it was.
    await submitCampaign(c.id, tunde.id, NOW)
    expect(await creator(c.id)).toBe(ada.id)
    await rejectCampaign(c.id, admin.id, 'broken_link', '', NOW)
    // Tunde edits it in place, money and timing included, which sends it back to review.
    const offer: OfferFields = {
      brand: 'Acme Foods', category: 'Food & drink', headline: 'Buy two, get one free', description: input.description,
      tileColor: '#FF5A1F', placement: 'card', redeemMethod: 'code', ageGated: false,
    }
    const edited = await editOffer(c.id, tunde.id, { ...offer, budgetUsd: 80, rewardLocal: 40, ...campaignDates('2026-12-01', 14, 'NG') }, NOW)
    expect(edited.campaign).toMatchObject({ status: 'review', headline: 'Buy two, get one free', createdById: ada.id })
    // Approved and live, then Tunde's revised offer is approved and swapped in.
    await approveCampaign(c.id, admin.id, new Date('2026-12-02T09:00:00Z'))
    const { revision } = await editOffer(c.id, tunde.id, { ...offer, headline: 'Buy three, get one free' }, new Date('2026-12-03T09:00:00Z'))
    const applied = await approveRevision(revision!.id, admin.id, new Date('2026-12-04T09:00:00Z'))
    expect(applied).toMatchObject({ headline: 'Buy three, get one free', version: 2, createdById: ada.id })
    expect(await creator(c.id)).toBe(ada.id)
  })
})
