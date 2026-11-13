import { describe, expect, it } from 'vitest'
import { mergeMine, type Mine, type PreviewOffer } from '@/lib/preview-merge'

const offer = (id: string, headline = `Offer ${id}`): PreviewOffer => ({
  id,
  brand: 'Other Brand',
  headline,
  description: 'Something good.',
  category: 'Retail',
  creative: { image: 'http://localhost:3100/uploads/a.png', color: null },
  share: { reward_label: '₦50 airtime' },
  ends_at: '2026-12-04T00:00:00.000Z',
})

const mine: Mine = {
  brand: 'Kola Bright',
  headline: 'Buy 2 get 1',
  description: 'At any stockist.',
  color: '#0F766E',
  rewardLabel: 'Share with 10 friends',
  endsAt: new Date('2026-12-04T00:00:00Z'),
}

describe('mergeMine', () => {
  it('puts my card first, outlined, when it is not among the offers', () => {
    const cards = mergeMine([offer('a'), offer('b')], { ...mine, id: 'c' })
    expect(cards.map((c) => c.key)).toEqual(['c', 'a', 'b'])
    expect(cards[0]).toMatchObject({ headline: 'Buy 2 get 1', outlined: true })
    expect(cards.slice(1).every((c) => !c.outlined)).toBe(true)
  })

  it('puts my card first when it has no id yet', () => {
    const cards = mergeMine([offer('a')], mine)
    expect(cards).toHaveLength(2)
    expect(cards[0]).toMatchObject({ brand: 'Kola Bright', outlined: true })
    expect(cards[1].key).toBe('a')
  })

  it('replaces the live offer with the same id where it sits, never duplicating it', () => {
    const cards = mergeMine([offer('a'), offer('b', 'Old headline'), offer('c')], { ...mine, id: 'b' })
    expect(cards.map((c) => c.key)).toEqual(['a', 'b', 'c'])
    expect(cards[1]).toMatchObject({ headline: 'Buy 2 get 1', outlined: true })
    expect(cards.filter((c) => c.outlined)).toHaveLength(1)
  })

  it('shows just my card when there are no live offers', () => {
    expect(mergeMine([], mine)).toEqual([expect.objectContaining({ brand: 'Kola Bright', outlined: true })])
  })

  it('maps an offer to the card the wall shows', () => {
    const [, card] = mergeMine([offer('a', 'Free data')], mine)
    expect(card).toEqual({
      key: 'a',
      brand: 'Other Brand',
      headline: 'Free data',
      description: 'Something good.',
      category: 'Retail',
      imageUrl: 'http://localhost:3100/uploads/a.png',
      color: null,
      rewardLabel: '₦50 airtime',
      endsAt: new Date('2026-12-04T00:00:00.000Z'),
    })
  })
})
