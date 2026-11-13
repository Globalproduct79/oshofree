import { describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { approveCampaign, createCampaign, rejectCampaign, submitCampaign, type CampaignInput } from '@/lib/campaigns'
import { checkLink } from '@/lib/link-check'
import { generateCode } from '@/lib/links'
import { approveWorkspace, declineWorkspace } from '@/lib/workspaces'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

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
  shareRewardLabel: 'Free drink',
  termsAccepted: true,
}

async function setup(wsStatus: 'pending' | 'approved' = 'approved') {
  const admin = await db.user.create({ data: { email: 'a@x.test', name: 'A', passwordHash: 'x', isGlobalAdmin: true } })
  const ws = await db.workspace.create({ data: { name: 'Acme', type: 'Brand', country: 'NG', status: wsStatus } })
  const c = await submitCampaign((await createCampaign(ws.id, input)).id)
  await db.channel.create({ data: { key: 'phoenix', name: 'Phoenix', apiKeyHash: 'h1', isLive: true } })
  await db.channel.create({ data: { key: 'other', name: 'Other', apiKeyHash: 'h2', isLive: false } })
  return { admin, ws, c }
}

describe('generateCode', () => {
  it('is 8 Crockford characters and unique over 1,000 calls', () => {
    const codes = new Set(Array.from({ length: 1000 }, generateCode))
    expect(codes.size).toBe(1000)
    for (const c of codes) expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/)
  })
})

describe('approveCampaign', () => {
  it('goes live, mints one Root link per live channel and records the decision', async () => {
    const { admin, c } = await setup()
    const live = await approveCampaign(c.id, admin.id)
    expect(live.status).toBe('live')
    expect(live.decidedAt).not.toBeNull()
    const links = await db.shareLink.findMany({ where: { campaignId: c.id } })
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({ depth: 0, sharerType: 'Root', parentId: null })
    const actions = await db.reviewAction.findMany({ where: { targetId: c.id } })
    expect(actions).toHaveLength(1)
    expect(actions[0]).toMatchObject({ targetType: 'Campaign', action: 'Approve', byUserId: admin.id })
  })
  it('does not mint a second link when approved twice', async () => {
    const { admin, c } = await setup()
    await approveCampaign(c.id, admin.id)
    await expect(approveCampaign(c.id, admin.id)).rejects.toBe('INVALID_TRANSITION')
    expect(await db.shareLink.count({ where: { campaignId: c.id } })).toBe(1)
    expect(await db.reviewAction.count({ where: { targetId: c.id } })).toBe(1)
  })
  it('refuses while the workspace is pending', async () => {
    const { admin, c } = await setup('pending')
    await expect(approveCampaign(c.id, admin.id)).rejects.toBe('WORKSPACE_NOT_APPROVED')
    expect((await db.campaign.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('review')
  })
})

describe('atomic decisions', () => {
  it('leaves the campaign in review with no links when the audit row cannot be written', async () => {
    const { c } = await setup()
    await expect(approveCampaign(c.id, 'no-such-user')).rejects.toBeDefined()
    expect((await db.campaign.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('review')
    expect(await db.shareLink.count({ where: { campaignId: c.id } })).toBe(0)
  })
  it('leaves a pending workspace pending when the audit row cannot be written', async () => {
    const { ws } = await setup('pending')
    await expect(approveWorkspace(ws.id, 'no-such-user')).rejects.toBeDefined()
    expect((await db.workspace.findUniqueOrThrow({ where: { id: ws.id } })).status).toBe('pending')
  })
})

describe('rejectCampaign', () => {
  it('stores the reason and records the decision', async () => {
    const { admin, c } = await setup()
    const r = await rejectCampaign(c.id, admin.id, '  Terms unclear  ')
    expect(r.status).toBe('rejected')
    expect(r.rejectReason).toBe('Terms unclear')
    expect(r.decidedAt).not.toBeNull()
    expect(await db.reviewAction.count({ where: { targetId: c.id, action: 'Reject', reason: 'Terms unclear' } })).toBe(1)
  })
  it('requires a reason', async () => {
    const { admin, c } = await setup()
    await expect(rejectCampaign(c.id, admin.id, '   ')).rejects.toBe('REASON_REQUIRED')
  })
})

describe('workspace decisions', () => {
  it('approves a pending workspace once', async () => {
    const { admin, ws } = await setup('pending')
    expect((await approveWorkspace(ws.id, admin.id)).status).toBe('approved')
    await expect(approveWorkspace(ws.id, admin.id)).rejects.toBe('INVALID_TRANSITION')
    expect(await db.reviewAction.count({ where: { targetId: ws.id, targetType: 'Workspace', action: 'Approve' } })).toBe(1)
  })
  it('declines with a reason', async () => {
    const { admin, ws } = await setup('pending')
    await expect(declineWorkspace(ws.id, admin.id, ' ')).rejects.toBe('REASON_REQUIRED')
    const d = await declineWorkspace(ws.id, admin.id, 'Not a real business')
    expect(d).toMatchObject({ status: 'declined', declineReason: 'Not a real business' })
    expect(await db.reviewAction.count({ where: { targetId: ws.id, action: 'Decline', reason: 'Not a real business' } })).toBe(1)
  })
})

describe('checkLink', () => {
  const res = (status: number) => (async () => ({ status, ok: status < 400 }) as Response) as typeof fetch
  it('is ok for 2xx and 3xx', async () => {
    expect(await checkLink('https://a.test', res(200))).toBe('ok')
    expect(await checkLink('https://a.test', res(302))).toBe('ok')
  })
  it('is broken for 404 and for a thrown error', async () => {
    expect(await checkLink('https://a.test', res(404))).toBe('broken')
    expect(await checkLink('https://a.test', (async () => { throw new Error('down') }) as typeof fetch)).toBe('broken')
  })
})
