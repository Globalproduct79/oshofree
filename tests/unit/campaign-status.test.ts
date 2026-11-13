import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { OfferCard } from '@/components/campaign/OfferCard'
import { deliveringWhere, effectiveStatus, lastDay } from '@/lib/campaign-status'
import { shortDate } from '@/lib/format'

const now = new Date('2026-11-13T12:00:00Z')
const hour = 3600_000
const day = 24 * hour
const at = (ms: number) => new Date(now.getTime() + ms)

describe('effectiveStatus', () => {
  it('live before startsAt is scheduled', () => {
    expect(effectiveStatus({ status: 'live', startsAt: at(day), endsAt: at(9 * day) }, now)).toBe('scheduled')
  })
  it('live after endsAt is ended', () => {
    expect(effectiveStatus({ status: 'live', startsAt: at(-9 * day), endsAt: at(-hour) }, now)).toBe('ended')
  })
  it('paused after endsAt is ended', () => {
    expect(effectiveStatus({ status: 'paused', startsAt: at(-9 * day), endsAt: at(-hour) }, now)).toBe('ended')
  })
  it('review stays review', () => {
    expect(effectiveStatus({ status: 'review', startsAt: at(-day), endsAt: at(day) }, now)).toBe('review')
  })
  it('live inside its flight is live', () => {
    expect(effectiveStatus({ status: 'live', startsAt: at(-day), endsAt: at(day) }, now)).toBe('live')
  })
})

describe('deliveringWhere', () => {
  it('matches the delivering predicate', () => {
    expect(deliveringWhere(now)).toEqual({
      status: 'live',
      startsAt: { lte: now },
      endsAt: { gt: now },
      workspace: { status: 'approved' },
    })
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
