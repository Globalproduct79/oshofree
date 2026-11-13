import { describe, expect, it } from 'vitest'
import { deliveringWhere, effectiveStatus } from '@/lib/campaign-status'

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
