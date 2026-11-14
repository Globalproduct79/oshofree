import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { OfferCard } from '@/components/campaign/OfferCard'
import { deliveringWhere, effectiveStatus, lastDay } from '@/lib/campaign-status'
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
  it('is exactly the live campaigns of approved workspaces', () => {
    expect(deliveringWhere(now)).toEqual({ status: 'live', workspace: { status: 'approved' } })
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
