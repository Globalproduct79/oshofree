import type { CampaignStatus, Prisma } from '@prisma/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveCapsAction, setRewardAction } from '@/app/app/(console)/rewards/actions'
import RewardsPage from '@/app/app/(console)/rewards/page'
import { auth } from '@/lib/auth'
import { REWARDS } from '@/lib/copy-rewards'
import { db } from '@/lib/db'

vi.mock('@/lib/auth', () => ({ auth: vi.fn(), signOut: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const jar = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => jar }))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => '/app/rewards',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

let seq = 0
const mkUser = (name: string, o: { isGlobalAdmin?: boolean } = {}) =>
  db.user.create({ data: { email: `u${++seq}@x.test`, name, passwordHash: 'x', ...o } })

async function setup(role: 'Owner' | 'Manager' | 'Viewer' = 'Owner') {
  const ws = await db.workspace.create({ data: { name: 'Kola Bright', type: 'Brand', country: 'NG', status: 'approved' } })
  const user = await mkUser('Tunde')
  await db.workspaceMember.create({ data: { userId: user.id, workspaceId: ws.id, role } })
  vi.mocked(auth).mockResolvedValue({ user: { id: user.id, isGlobalAdmin: false }, expires: '' } as never)
  jar.get.mockImplementation((k: string) => (k === 'of_ws' ? { value: ws.id } : undefined))
  return { ws, user }
}

function mkCampaign(workspaceId: string, name: string, status: CampaignStatus = 'live', o: Partial<Prisma.CampaignUncheckedCreateInput> = {}) {
  return db.campaign.create({
    data: {
      workspaceId, name, brand: 'Kola Bright', country: 'NG', category: 'Food & drink', headline: 'h', description: 'd',
      placement: 'card', redeemMethod: 'code', budgetUsd: 300, shareRewardLabel: 'old', rewardLocal: 50, status,
      startsAt: new Date('2026-11-07T23:00:00Z'), endsAt: new Date('2099-11-21T23:00:00Z'), submittedAt: new Date('2026-11-05T09:00:00Z'),
      ...o,
    },
  })
}

const page = async () => {
  const markup = renderToStaticMarkup(await RewardsPage())
  return { markup, text: markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') }
}

beforeEach(() => vi.clearAllMocks())

describe('Rewards', () => {
  it('persists a reward change and re-derives the label', async () => {
    const { ws } = await setup()
    const c = await mkCampaign(ws.id, 'Buy 2')
    expect(await setRewardAction(c.id, 75)).toEqual({ ok: true })
    const after = await db.campaign.findUniqueOrThrow({ where: { id: c.id } })
    expect(after.rewardLocal).toBe(75)
    expect(after.shareRewardLabel).not.toBe('old')
    expect(after.shareRewardLabel).toContain('75')
  })

  it('refuses a bad reward and a campaign of another workspace', async () => {
    const { ws } = await setup()
    const other = await db.workspace.create({ data: { name: 'Other', type: 'Brand', country: 'NG', status: 'approved' } })
    const mine = await mkCampaign(ws.id, 'Mine')
    const theirs = await mkCampaign(other.id, 'Theirs')
    expect(await setRewardAction(mine.id, -5)).toHaveProperty('error')
    expect(await setRewardAction(mine.id, 2.5)).toHaveProperty('error')
    expect(await setRewardAction(theirs.id, 10)).toHaveProperty('error')
    expect((await db.campaign.findUniqueOrThrow({ where: { id: theirs.id } })).rewardLocal).toBe(50)
  })

  it('refuses a Viewer on both actions; a Manager succeeds', async () => {
    const { ws } = await setup('Viewer')
    const c = await mkCampaign(ws.id, 'Buy 2')
    await expect(setRewardAction(c.id, 60)).rejects.toBe('FORBIDDEN')
    await expect(saveCapsAction({ maxPerSharerPerDay: 3, capPct: 10, pointsPerShare: 1 })).rejects.toBe('FORBIDDEN')
    const m = await setup('Manager')
    const c2 = await mkCampaign(m.ws.id, 'Buy 3')
    expect(await setRewardAction(c2.id, 60)).toEqual({ ok: true })
    expect(await saveCapsAction({ maxPerSharerPerDay: 3, capPct: 10, pointsPerShare: 1 })).toEqual({ ok: true })
  })

  it('saves the caps, lowers campaigns above the cap, and audits', async () => {
    const { ws } = await setup()
    const high = await mkCampaign(ws.id, 'High', 'live', { rewardCapPct: 30 })
    const low = await mkCampaign(ws.id, 'Low', 'live', { rewardCapPct: 15 })
    expect(await saveCapsAction({ maxPerSharerPerDay: 3, capPct: 20, pointsPerShare: 12 })).toEqual({ ok: true })
    const w = await db.workspace.findUniqueOrThrow({ where: { id: ws.id } })
    expect([w.rewardMaxPerSharerPerDay, w.rewardCapPct, w.pointsPerShare]).toEqual([3, 20, 12])
    expect((await db.campaign.findUniqueOrThrow({ where: { id: high.id } })).rewardCapPct).toBe(20)
    expect((await db.campaign.findUniqueOrThrow({ where: { id: low.id } })).rewardCapPct).toBe(15)
    const ev = await db.auditEvent.findFirstOrThrow({ where: { action: 'rewards.caps', workspaceId: ws.id } })
    expect(ev.after).toEqual({ maxPerSharerPerDay: 3, capPct: 20, pointsPerShare: 12 })
    expect(ev.before).toEqual({ maxPerSharerPerDay: 5, capPct: 20, pointsPerShare: 10 })
  })

  it('rejects invalid caps without changing anything', async () => {
    const { ws } = await setup()
    for (const bad of [
      { maxPerSharerPerDay: 0, capPct: 20, pointsPerShare: 10 },
      { maxPerSharerPerDay: 5, capPct: 0, pointsPerShare: 10 },
      { maxPerSharerPerDay: 5, capPct: 101, pointsPerShare: 10 },
      { maxPerSharerPerDay: 5, capPct: 20, pointsPerShare: -1 },
      { maxPerSharerPerDay: 5.5, capPct: 20, pointsPerShare: 10 },
      { maxPerSharerPerDay: Number.NaN, capPct: 20, pointsPerShare: 10 },
    ]) expect(await saveCapsAction(bad)).toHaveProperty('error')
    const w = await db.workspace.findUniqueOrThrow({ where: { id: ws.id } })
    expect([w.rewardMaxPerSharerPerDay, w.rewardCapPct, w.pointsPerShare]).toEqual([5, 20, 10])
    expect(await db.auditEvent.count({ where: { action: 'rewards.caps' } })).toBe(0)
  })

  it('lists live campaigns but not ended or rejected, with paid and cap', async () => {
    const { ws } = await setup()
    const live = await mkCampaign(ws.id, 'Live one')
    await mkCampaign(ws.id, 'Ended one', 'ended')
    await mkCampaign(ws.id, 'Rejected one', 'rejected')
    await db.ledgerEntry.create({ data: { workspaceId: ws.id, campaignId: live.id, kind: 'reward', amountCents: -700, description: 'r' } })
    const { text } = await page()
    expect(text).toContain('Live one')
    expect(text).not.toContain('Ended one')
    expect(text).not.toContain('Rejected one')
    expect(text).toContain('Nigeria')
    expect(text).toContain('NGN')
    expect(text).toContain('$7')
    expect(text).toContain('$60')
  })

  it('shows the cap labels and the Delivery text', async () => {
    await setup()
    const { text, markup } = await page()
    for (const s of [REWARDS.caps.maxPerDay, REWARDS.caps.capPct, REWARDS.caps.points, REWARDS.caps.save, REWARDS.delivery.text]) {
      expect(text).toContain(s)
    }
    expect(markup).toContain('<input')
  })

  it("a Viewer's page has no inputs and no Save", async () => {
    const { ws } = await setup('Viewer')
    await mkCampaign(ws.id, 'Live one')
    const { markup, text } = await page()
    expect(markup).not.toContain('<input')
    expect(text).not.toContain('Save')
    expect(text).toContain(REWARDS.caps.maxPerDay)
  })
})
