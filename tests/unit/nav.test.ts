import { describe, expect, it } from 'vitest'
import { SHELL } from '@/lib/copy-shell'
import { isCurrent, navFor } from '@/lib/nav'

const zero = { campaigns: 0, invoices: 0, review: 0 }
const labels = (g: { label: string }[]) => g.map((x) => x.label)
const hrefs = (g: { items: { href: string }[] }[]) => g.flatMap((x) => x.items.map((i) => i.href))

describe('navFor', () => {
  it('gives an Owner the four workspace groups and no PLATFORM', () => {
    const groups = navFor({ role: 'Owner', inWorkspace: true, counts: zero })
    expect(labels(groups)).toEqual(['Campaigns', 'Growth', 'Money', 'Organisation'])
    expect(hrefs(groups)).toEqual([
      '/app', '/app/campaigns/new', '/app/sharing', '/app/rewards', '/app/billing', '/app/invoices',
      '/app/people', '/app/workspace', '/app/notifications',
    ])
    expect(groups.flatMap((g) => g.items.map((i) => i.label))).toEqual([
      'Campaigns', 'New campaign', 'Sharing', 'Rewards', 'Billing & credit', 'Invoices', 'People', 'Workspace', 'Notifications',
    ])
  })

  it('never gives a Manager or a Viewer the PLATFORM group', () => {
    for (const role of ['Manager', 'Viewer'] as const) {
      const groups = navFor({ role, inWorkspace: true, counts: { campaigns: 1, invoices: 1, review: 4 } })
      expect(labels(groups)).not.toContain('Platform')
      expect(hrefs(groups).some((h) => h.startsWith('/admin'))).toBe(false)
    }
  })

  it('appends PLATFORM for Global inside a workspace', () => {
    const groups = navFor({ role: 'Global', inWorkspace: true, counts: zero })
    expect(labels(groups)).toEqual(['Campaigns', 'Growth', 'Money', 'Organisation', 'Platform'])
    expect(groups[4].items.map((i) => [i.label, i.href])).toEqual([
      ['Review', '/admin/review'],
      ['Advertisers', '/admin/advertisers'],
      ['Rates', '/admin/rates'],
      ['Phoenix settlement', '/admin/settlement'],
      ['Rewards ledger', '/admin/rewards'],
      ['Phoenix API', '/admin/api'],
    ])
  })

  it('gives Global in Platform mode the PLATFORM group only', () => {
    expect(labels(navFor({ role: 'Global', inWorkspace: false, counts: zero }))).toEqual(['Platform'])
  })

  it('shows counts above 0 on Campaigns, Invoices and Review only, and hides them at 0', () => {
    const count = (counts: typeof zero) =>
      Object.fromEntries(
        navFor({ role: 'Global', inWorkspace: true, counts })
          .flatMap((g) => g.items)
          .filter((i) => i.count !== undefined)
          .map((i) => [i.label, i.count]),
      )
    expect(count({ campaigns: 2, invoices: 1, review: 3 })).toEqual({ Campaigns: 2, Invoices: 1, Review: 3 })
    expect(count(zero)).toEqual({})
  })

  it('gives every item an icon', () => {
    for (const i of navFor({ role: 'Global', inWorkspace: true, counts: zero }).flatMap((g) => g.items)) {
      expect(i.icon).toBeTruthy()
    }
  })
})

describe('isCurrent', () => {
  it('keeps Campaigns current on a campaign page but not on New campaign', () => {
    expect(isCurrent('/app', '/app')).toBe(true)
    expect(isCurrent('/app/campaigns/c123', '/app')).toBe(true)
    expect(isCurrent('/app/campaigns/new', '/app')).toBe(false)
    expect(isCurrent('/app/sharing', '/app')).toBe(false)
  })

  it('makes New campaign current on the form and on Edit offer', () => {
    expect(isCurrent('/app/campaigns/new', '/app/campaigns/new')).toBe(true)
    expect(isCurrent('/app/campaigns/c123/edit', '/app/campaigns/new')).toBe(true)
    expect(isCurrent('/app/campaigns/c123/edit', '/app')).toBe(false)
  })

  it('matches a section and its subpages', () => {
    expect(isCurrent('/app/invoices', '/app/invoices')).toBe(true)
    expect(isCurrent('/app/invoices/i1/print', '/app/invoices')).toBe(true)
    expect(isCurrent('/admin/advertisers/w1', '/admin/advertisers')).toBe(true)
    expect(isCurrent('/admin/rewards', '/admin/review')).toBe(false)
    expect(isCurrent(null, '/app')).toBe(false)
  })
})

describe('bell line', () => {
  it('joins detail and age, and shows only the age when there is no detail', () => {
    expect(SHELL.bell.line('budget will finish ~3 days early', '2h ago')).toBe('budget will finish ~3 days early · 2h ago')
    expect(SHELL.bell.line('', '3h ago')).toBe('3h ago')
    expect(SHELL.bell.line(null, 'now')).toBe('now')
  })
})
