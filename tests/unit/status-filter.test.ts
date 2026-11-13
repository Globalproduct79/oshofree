import { describe, expect, it } from 'vitest'
import type { EffectiveStatus } from '@/lib/campaign-status'
import { countByFilter, gridFor, inFilter, parseStatusFilter } from '@/lib/campaign-filters'

const ALL: EffectiveStatus[] = ['draft', 'review', 'scheduled', 'live', 'paused', 'rejected', 'ended']

describe('parseStatusFilter', () => {
  it('reads the five pills from ?status=', () => {
    for (const f of ['all', 'live', 'review', 'paused', 'ended'] as const) expect(parseStatusFilter(f)).toBe(f)
  })
  it('falls back to all for anything else', () => {
    for (const raw of [undefined, '', 'draft', 'rejected', 'scheduled', 'LIVE', ['live', 'paused']])
      expect(parseStatusFilter(raw)).toBe('all')
  })
})

describe('inFilter', () => {
  it('keeps every status under All', () => {
    expect(ALL.every((s) => inFilter(s, 'all'))).toBe(true)
  })
  it('puts scheduled under Live, and draft and rejected under All only', () => {
    expect(ALL.filter((s) => inFilter(s, 'live'))).toEqual(['scheduled', 'live'])
    expect(ALL.filter((s) => inFilter(s, 'review'))).toEqual(['review'])
    expect(ALL.filter((s) => inFilter(s, 'paused'))).toEqual(['paused'])
    expect(ALL.filter((s) => inFilter(s, 'ended'))).toEqual(['ended'])
  })
})

describe('countByFilter', () => {
  it('counts each pill', () => {
    expect(countByFilter([...ALL, 'live', 'paused'])).toEqual({ all: 9, live: 3, review: 1, paused: 2, ended: 1 })
  })
  it('counts zero everywhere for no campaigns', () => {
    expect(countByFilter([])).toEqual({ all: 0, live: 0, review: 0, paused: 0, ended: 0 })
  })
})

describe('gridFor', () => {
  const rows = [
    { id: 'hero', status: 'live' as const },
    { id: 'soon', status: 'scheduled' as const },
    { id: 'draft', status: 'draft' as const },
    { id: 'stopped', status: 'paused' as const },
  ]
  it('leaves the hero out under All, since it is already at the top', () => {
    expect(gridFor(rows, 'all', 'hero').map((r) => r.id)).toEqual(['soon', 'draft', 'stopped'])
  })
  it('lists every match under a status pill, the hero included', () => {
    expect(gridFor(rows, 'live', 'hero').map((r) => r.id)).toEqual(['hero', 'soon'])
    expect(gridFor(rows, 'ended', 'hero')).toEqual([])
  })
  it('keeps everything under All when there is no hero', () => {
    expect(gridFor(rows, 'all', null)).toHaveLength(4)
  })
})
