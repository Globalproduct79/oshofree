import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ActivityBox } from '@/components/campaign/ActivityBox'
import { SharerList } from '@/components/sharing/SharerList'
import type { ActivityLine, SharerRow } from '@/lib/activity'

// Show more's action module signs in through Auth.js; nothing here calls it.
vi.mock('@/lib/auth', () => ({ auth: vi.fn(), signOut: vi.fn() }))
vi.mock('next/navigation', async (o) => ({ ...(await o<typeof import('next/navigation')>()), useRouter: () => ({ push: vi.fn() }) }))

// The campaign page's Recent activity and the Sharing page's Sharers, as markup (Prompt 8).

const lines: ActivityLine[] = [
  { key: 'reward-cm2', text: '₦50 airtime for +234 80• ••• 4567 queued · 13 Nov, 11:25', title: 'cm2' },
  { key: 'fc-cm1', text: 'A friend of +234 80• ••• 4567 took claim code PHX-•••• · 13 Nov, 11:25', title: 'cm1 · cm2 · cm3' },
  { key: 'points-points:cm2:void', text: '10 points taken back from +234 80• ••• 4567 · 13 Nov, 11:20', title: 'points:cm2:void' },
]
const box = (o: Partial<Parameters<typeof ActivityBox>[0]> = {}) =>
  renderToStaticMarkup(<ActivityBox campaignId="c1" market="Nigeria" lines={lines} next={null} line={null} windowed={false} {...o} />)

describe('ActivityBox', () => {
  it('is a box titled Recent activity, one list line per event with its ids as the tooltip and an anchor', () => {
    const m = box()
    expect(m).toContain('<h3>Recent activity</h3>')
    expect(m).toContain('Every event on this campaign, newest first, in Nigeria time. Hover a line for its record id.')
    expect(m).toContain('<div class="box" id="activity">')
    expect(m).toContain('<li id="act-reward-cm2" title="cm2">₦50 airtime for +234 80• ••• 4567 queued · 13 Nov, 11:25</li>')
    expect(m).toContain('<li id="act-fc-cm1" title="cm1 · cm2 · cm3">')
    expect(m).toContain('<li id="act-points-points-cm2-void" title="points:cm2:void">')
    expect(m.match(/<li /g)).toHaveLength(3)
    expect(m).not.toContain('Show more')
  })

  it('offers Show more for the 30 below the last line: a link to that page, which a click fetches in place', () => {
    const m = box({ next: 'points-points:cm2:void' })
    expect(m).toContain('<a class="btn g s" href="/app/campaigns/c1?before=points-points%3Acm2%3Avoid">Show more</a>')
    expect(m).not.toContain('Newest')
  })

  it('lights the line a link asked for, keeps it in Show more, and leads back to the newest', () => {
    const m = box({ line: 'fc-cm1', windowed: true, next: 'points-points:cm2:void' })
    expect(m).toContain('<li id="act-fc-cm1" title="cm1 · cm2 · cm3" class="on" aria-current="true">')
    expect(m.match(/class="on"/g)).toHaveLength(1)
    expect(m).toContain('href="/app/campaigns/c1?line=fc-cm1&amp;before=points-points%3Acm2%3Avoid">Show more</a>')
    expect(m).toContain('<div class="btns top"><a class="btn g s" href="/app/campaigns/c1">Newest</a></div>')
  })

  it('says nothing has happened yet, or nothing older on a later page', () => {
    const m = box({ lines: [] })
    expect(m).toContain('<p class="hist-none">Nothing yet. Impressions, opens, claims, shares and rewards show here as they are recorded.</p>')
    expect(m).not.toContain('<ul')
    expect(box({ lines: [], windowed: true })).toContain('<p class="hist-none">Nothing older than this.</p>')
  })
})

const row = (o: Partial<SharerRow> = {}): SharerRow => ({
  key: 'c1|c:ada', campaignId: 'c1', campaign: 'Buy 2 get 1', who: '+234 80• ••• 4567', friendOf: null, via: 'WhatsApp',
  opened: 3, claimed: 1, rewards: '₦50 queued', total: 2,
  lines: [
    { key: 'fc-e2', text: 'A friend took claim code PHX-••••, ₦50 airtime queued · 13 Nov, 11:25', title: 'e2 · p1' },
    { key: 'fo-e1', text: 'A friend opened the offer · 13 Nov, 11:20', title: 'e1' },
  ],
  ...o,
})
const list = (rows: SharerRow[], more = false, limit = 30) => renderToStaticMarkup(<SharerList rows={rows} more={more} limit={limit} />)

describe('SharerList', () => {
  it('is one row per sharer that opens to their friends’ events, ids as tooltips', () => {
    const m = list([row(), row({ key: 'c1|c:bayo', who: '+234 80• ••• 2222', friendOf: '+234 80• ••• 4567', via: null, opened: 0, claimed: 0, rewards: null, lines: [], total: 0 })])
    expect(m).toContain('<h3>Sharers</h3>')
    expect(m.match(/<details>/g)).toHaveLength(2)
    expect(m).toContain(
      '<summary><span class="ph">+234 80• ••• 4567</span><span class="of">Buy 2 get 1 · shared via WhatsApp</span><span class="v">3 friends opened · 1 claimed · ₦50 queued</span></summary>',
    )
    expect(m).toContain('<li title="e2 · p1">A friend took claim code PHX-••••, ₦50 airtime queued · 13 Nov, 11:25</li>')
    expect(m).toContain('<span class="of">Buy 2 get 1 · friend of +234 80• ••• 4567</span><span class="v">0 friends opened · 0 claimed</span>')
    expect(m).toContain('<p class="hist-none">No friend has opened their link yet.</p>')
  })

  it("says when a sharer has more friends' events than it shows, and where they all are", () => {
    const m = list([row({ total: 45 })])
    expect(m).toContain('The newest 2 of 45.')
    expect(m).toContain('<a href="/app/campaigns/c1#activity">The campaign&#x27;s Recent activity has every one.</a>')
  })

  it('pages by 30 and says when there are none', () => {
    expect(list([row()], true, 30)).toMatch(/<a class="btn g s" href="\/app\/sharing\?sharers=60"[^>]*>Show more<\/a>/)
    const m = list([])
    expect(m).toContain('No sharers yet. They appear once someone shares one of your offers.')
    expect(m).not.toContain('<details')
  })
})
