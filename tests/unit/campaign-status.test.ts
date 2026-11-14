import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { OfferCard } from '@/components/campaign/OfferCard'
import { deliveringWhere, effectiveStatus, isDelivering, lastDay } from '@/lib/campaign-status'
import { db } from '@/lib/db'
import { shortDate } from '@/lib/format'

const now = new Date('2026-11-13T12:00:00Z')

describe('effectiveStatus', () => {
  it('is the stored status, whatever the dates say', () => {
    const statuses = ['draft', 'review', 'scheduled', 'live', 'paused', 'rejected', 'ended'] as const
    // Dates that slice 1 would have read as "scheduled" or "ended".
    const startsAt = new Date('2026-12-01T00:00:00Z')
    const endsAt = new Date('2026-11-01T00:00:00Z')
    for (const status of statuses) {
      const campaign = { status, startsAt, endsAt }
      expect(effectiveStatus(campaign, now)).toBe(status)
    }
  })
})

describe('deliveringWhere', () => {
  it('is exactly the live campaigns of approved workspaces whose flight has not ended', () => {
    expect(deliveringWhere(now)).toEqual({ status: 'live', endsAt: { gt: now }, workspace: { status: 'approved' } })
  })
})

describe('isDelivering', () => {
  it('passes exactly the campaigns deliveringWhere finds: live, in an approved workspace, before its end', async () => {
    const statuses = ['draft', 'review', 'scheduled', 'live', 'paused', 'rejected', 'ended'] as const
    const ends = [new Date(now.getTime() - 1), now, new Date(now.getTime() + 1)]
    for (const status of ['approved', 'pending', 'declined'] as const) {
      const ws = await db.workspace.create({ data: { name: status, type: 'Brand', country: 'NG', status } })
      await db.campaign.createMany({
        data: statuses.flatMap((s) => ends.map((endsAt) => ({
          workspaceId: ws.id, name: 'C', brand: 'B', country: 'NG' as const, category: 'Food & drink', headline: 'H',
          description: 'D', placement: 'card' as const, redeemMethod: 'code' as const, budgetUsd: 100, shareRewardLabel: 'R',
          status: s, startsAt: new Date('2026-11-01T00:00:00Z'), endsAt,
        }))),
      })
    }
    const all = await db.campaign.findMany({ include: { workspace: true } })
    expect(all).toHaveLength(63)
    const found = new Set((await db.campaign.findMany({ where: deliveringWhere(now), select: { id: true } })).map((c) => c.id))
    expect(found.size).toBe(1)
    for (const c of all) expect(isDelivering(c, now)).toBe(found.has(c.id))
  })
})

describe('lastDay', () => {
  const endsAt = new Date('2026-11-27T00:00:00Z') // exclusive: the offer stops at midnight UTC

  it('is the day before an exclusive midnight end', () => {
    expect(shortDate(lastDay(endsAt))).toBe('26 Nov')
  })

  it('is the day the Offers card prints', () => {
    const card = { brand: 'Kola', headline: 'Buy 2', description: '', rewardLabel: 'Airtime', endsAt }
    expect(renderToStaticMarkup(createElement(OfferCard, { offer: card }))).toContain('Ends 26 Nov')
  })
})
