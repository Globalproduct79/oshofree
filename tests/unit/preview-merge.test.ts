import { describe, expect, it } from 'vitest'
import { previewWall, type PreviewOffer } from '@/lib/preview-merge'

const offer = (id: string, placement: PreviewOffer['placement'] = 'card'): PreviewOffer => ({
  id,
  brand: `Brand ${id}`,
  headline: `Offer ${id}`,
  category: 'Retail',
  placement,
  ageGated: false,
  creative: { image: null, video: null, color: '#0F766E' },
})

const ids = (list: PreviewOffer[]) => list.map((o) => o.id)

describe('previewWall', () => {
  it.each(['featured', 'video', 'splash'] as const)('a %s campaign previewed is the featured slot', (placement) => {
    const mine = offer('m', placement)
    const wall = previewWall(mine, [offer('a'), offer('f', 'featured')])
    expect(wall.featured?.id).toBe('m')
    expect(ids(wall.tiles)).toEqual(['a', 'f'])
  })

  it('a card previewed shows the first other live featured or video offer', () => {
    const wall = previewWall(offer('m'), [offer('s', 'splash'), offer('a'), offer('v', 'video'), offer('f', 'featured')])
    expect(wall.featured?.id).toBe('v')
    expect(ids(wall.tiles)).toEqual(['m', 's', 'a', 'f'])
  })

  it('shows no featured tile when none is live', () => {
    const wall = previewWall(offer('m'), [offer('a'), offer('s', 'splash')])
    expect(wall.featured).toBeUndefined()
    expect(ids(wall.tiles)).toEqual(['m', 'a', 's'])
  })

  it('lists the previewed card first, then at most five others', () => {
    const live = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => offer(id))
    expect(ids(previewWall(offer('m'), live).tiles)).toEqual(['m', 'a', 'b', 'c', 'd', 'e'])
  })

  it('counts the previewed campaign once when it is live itself', () => {
    const mine = offer('m')
    const wall = previewWall(mine, [offer('a'), { ...mine, headline: 'Stale' }, offer('b')])
    expect(ids(wall.tiles)).toEqual(['m', 'a', 'b'])
    expect(wall.tiles[0]).toBe(mine)
  })

  it('does not offer the previewed featured campaign again among the tiles', () => {
    const mine = offer('m', 'featured')
    expect(ids(previewWall(mine, [mine, offer('a')]).tiles)).toEqual(['a'])
  })
})
