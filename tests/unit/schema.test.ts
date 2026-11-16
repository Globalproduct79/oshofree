import { describe, expect, it } from 'vitest'
import { RejectReason } from '@prisma/client'
import { db } from '@/lib/db'

const day = new Date('2026-11-13T00:00:00Z')

describe('slice-2 schema', () => {
  it('RejectReason has six values', () => {
    expect(Object.keys(RejectReason)).toHaveLength(6)
  })

  it('creates one row of each new model', async () => {
    const user = await db.user.create({ data: { email: 'a@b.co', passwordHash: 'x', name: 'A' } })
    const ws = await db.workspace.create({ data: { name: 'W', type: 'Brand', country: 'NG' } })
    expect(ws.creditLimitCents).toBe(50000)
    // Nobody until Global approves the workspace (Prompt 10; the prototype's fixed "Obinna A." is gone).
    expect(ws.accountManager).toBeNull()
    expect(ws.termsDays).toBe(14)
    const channel = await db.channel.create({
      data: { key: 'ch', name: 'Ch', apiKeyHash: 'h', previousKeyHash: 'p', previousKeyValidUntil: day },
    })
    expect(channel.keyCreatedAt).toBeInstanceOf(Date)
    const campaign = await db.campaign.create({
      data: {
        workspaceId: ws.id, name: 'C', brand: 'B', country: 'NG', category: 'c', headline: 'h', description: 'd',
        placement: 'card', redeemMethod: 'code', budgetUsd: 100, startsAt: day, endsAt: day,
        shareRewardLabel: 'x', status: 'scheduled', rejectReasonCode: 'broken_link', fxPerUsd: '1500.5',
      },
    })
    expect(campaign.version).toBe(1)
    expect(campaign.ageGated).toBe(false)
    const link = await db.shareLink.create({
      data: { code: 'abc', campaignId: campaign.id, channelId: channel.id, depth: 0, sharerType: 'Root', via: 'facebook' },
    })
    const invoice = await db.invoice.create({
      data: { workspaceId: ws.id, number: 'INV-1', period: day, amountCents: 100, fxPerUsd: '1500', country: 'NG', status: 'open', issuedAt: day, dueAt: day },
    })

    await db.invitation.create({ data: { workspaceId: ws.id, email: 'i@b.co', role: 'Viewer', token: 't', invitedById: user.id, expiresAt: day } })
    await db.notification.create({ data: { userId: user.id, kind: 'approved', title: 'T' } })
    await db.notification.create({ data: { kind: 'system', title: 'Global' } })
    await db.notificationPref.create({ data: { userId: user.id, workspaceId: ws.id, kind: 'pace', enabled: true } })
    await db.auditEvent.create({ data: { actorId: user.id, action: 'a', targetType: 't', targetId: 'i', before: { a: 1 } } })
    await db.creditRequest.create({ data: { workspaceId: ws.id, requestedById: user.id, status: 'open' } })
    await db.campaignRevision.create({ data: { campaignId: campaign.id, data: {}, status: 'review' } })
    await db.ledgerEntry.create({ data: { workspaceId: ws.id, description: 'd', amountCents: 5, kind: 'delivery', invoiceId: invoice.id, dedupeKey: 'k' } })
    await db.rateCard.create({ data: { channelId: channel.id, country: 'NG', placement: 'card', cpmCents: 100, effectiveFrom: day } })
    await db.marketFx.create({ data: { country: 'NG', fxPerUsd: '1500', effectiveFrom: day } })
    await db.channelShare.create({ data: { channelId: channel.id, share: '0.7', effectiveFrom: day } })
    await db.settlementStatement.create({ data: { channelId: channel.id, period: day, amountCents: 10, status: 'open' } })
    await db.rewardPayout.create({
      data: { campaignId: campaign.id, workspaceId: ws.id, shareLinkId: link.id, claimEventKey: 'ck', amountLocal: 100, amountCents: 7, status: 'held', reason: 'cap' },
    })
    await db.pointsLedger.create({ data: { sharerSessionId: 's', campaignId: campaign.id, points: 10 } })
    const acct = await db.aggregatorAccount.create({ data: { balanceCents: 0 } })
    expect(acct.id).toBe('reloadly')
    await db.aggregatorTopup.create({ data: { amountCents: 1, byUserId: user.id } })
    await db.fraudRule.create({ data: { key: 'same_device', label: 'L', action: 'hold', enabled: true } })
    await db.claimCode.create({ data: { code: 'CC', campaignId: campaign.id, channelId: channel.id, sessionId: 's', day, validUntil: day } })
    await db.jobRun.create({ data: { name: 'n', day } })
    expect(await db.claimCode.count()).toBe(1)
  })
})
