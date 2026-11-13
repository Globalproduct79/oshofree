import type { Workspace } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pause, previewOffers, saveDraft, submit } from '@/app/app/(console)/campaigns/actions'
import { createCampaign, type CampaignInput } from '@/lib/campaigns'
import { db } from '@/lib/db'
import { requireWorkspace } from '@/lib/workspaces'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/workspaces', () => ({ requireWorkspace: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const input: CampaignInput = {
  name: 'Harmattan Sale',
  brand: 'Acme Foods',
  country: 'NG',
  category: 'Food & drink',
  headline: 'Buy one, get one free',
  description: 'Show the code at any Acme outlet to get a free second item.',
  placement: 'card',
  redeemMethod: 'code',
  claimCode: 'ACME1',
  budgetUsd: 50,
  startsAt: '2026-12-01',
  runsForDays: 14,
  shareRewardLabel: 'Share with 10 friends, get ₦50 airtime',
  termsAccepted: true,
}

let mine: Workspace
let theirs: Workspace
beforeEach(async () => {
  mine = await db.workspace.create({ data: { name: 'Acme', type: 'Brand', country: 'NG' } })
  theirs = await db.workspace.create({ data: { name: 'Rival', type: 'Brand', country: 'NG' } })
  vi.mocked(requireWorkspace).mockResolvedValue(mine)
})

describe('saveDraft', () => {
  it('creates a draft in the current workspace', async () => {
    const res = await saveDraft(input)
    expect(res).toHaveProperty('id')
    const row = await db.campaign.findUniqueOrThrow({ where: { id: (res as { id: string }).id } })
    expect(row).toMatchObject({ workspaceId: mine.id, status: 'draft', name: 'Harmattan Sale' })
  })

  it("updates the workspace's own draft", async () => {
    const own = await createCampaign(mine.id, input)
    expect(await saveDraft({ ...input, name: 'Renamed' }, own.id)).toEqual({ id: own.id })
    expect((await db.campaign.findUniqueOrThrow({ where: { id: own.id } })).name).toBe('Renamed')
  })

  it("refuses an id that belongs to another workspace and leaves it alone", async () => {
    const other = await createCampaign(theirs.id, input)
    const res = await saveDraft({ ...input, name: 'Hijacked' }, other.id)
    expect(res).toHaveProperty('error')
    const row = await db.campaign.findUniqueOrThrow({ where: { id: other.id } })
    expect(row).toMatchObject({ workspaceId: theirs.id, name: 'Harmattan Sale' })
  })

  it('returns the business-rule message and saves nothing', async () => {
    const res = await saveDraft({ ...input, redeemMethod: 'link', claimCode: undefined, linkUrl: 'http://acme.ng' })
    expect(res).toEqual({ error: 'Online offers need an https:// link.' })
    expect(await db.campaign.count()).toBe(0)
  })

  it('refuses input the schema rejects, whatever the client sends', async () => {
    const res = await saveDraft({ ...input, budgetUsd: 10, workspaceId: theirs.id })
    expect(res).toHaveProperty('error')
    expect(await db.campaign.count()).toBe(0)
  })
})

describe('transitions', () => {
  it('submits its own draft to review', async () => {
    const own = await createCampaign(mine.id, input)
    expect(await submit(own.id)).toEqual({ ok: true })
    expect((await db.campaign.findUniqueOrThrow({ where: { id: own.id } })).status).toBe('review')
  })

  it("refuses to submit another workspace's campaign", async () => {
    const other = await createCampaign(theirs.id, input)
    expect(await submit(other.id)).toHaveProperty('error')
    expect((await db.campaign.findUniqueOrThrow({ where: { id: other.id } })).status).toBe('draft')
  })

  it("explains when a campaign can't change state", async () => {
    const own = await createCampaign(mine.id, input)
    expect(await pause(own.id)).toEqual({ error: "That campaign can't change state right now." })
  })
})

describe('previewOffers', () => {
  const DAY = 86_400_000
  const live = (workspaceId: string, country: 'NG' | 'KE', headline: string) =>
    db.campaign.create({
      data: {
        workspaceId, name: headline, brand: 'Rival', country, category: 'Retail', headline, description: 'Real.',
        placement: 'card', redeemMethod: 'code', claimCode: 'R1', budgetUsd: 50, status: 'live', shareRewardLabel: 'Airtime',
        startsAt: new Date(Date.now() - DAY), endsAt: new Date(Date.now() + DAY),
      },
    })

  beforeEach(async () => {
    await db.workspace.update({ where: { id: theirs.id }, data: { status: 'approved' } })
    await live(theirs.id, 'NG', 'Lagos offer')
    await live(theirs.id, 'KE', 'Nairobi offer')
  })

  it('shows nothing but your own card when Phoenix is not set up', async () => {
    expect(await previewOffers('NG')).toEqual([])
  })

  it("lists the offers Phoenix would pull in that country, any workspace's", async () => {
    await db.channel.create({ data: { key: 'phoenix', name: 'Phoenix', apiKeyHash: 'x', isLive: true } })
    expect((await previewOffers('NG')).map((o) => o.headline)).toEqual(['Lagos offer'])
  })

  it('answers an empty list for a country outside the five markets', async () => {
    await db.channel.create({ data: { key: 'phoenix', name: 'Phoenix', apiKeyHash: 'x', isLive: true } })
    expect(await previewOffers('GB')).toEqual([])
    expect(await previewOffers(undefined)).toEqual([])
  })
})
