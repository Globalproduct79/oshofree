import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  AlertBox,
  BarChart14d,
  Box,
  Button,
  CampaignCard,
  CreativeMedia,
  DataTable,
  EmptyState,
  EstimatePanel,
  FilterPills,
  Funnel,
  HBarList,
  HeroCampaignCard,
  KVGrid,
  Leaderboard,
  LinkButton,
  MetricCard,
  NewCampaignTile,
  OptionTile,
  StatusBadge,
  Steps,
  Swatches,
  ToggleRow,
  TokenChip,
  type CardModel,
  type HeroModel,
} from '@/components/og'
import { tokens } from '@/lib/tokens'

const html = (el: ReactElement) => renderToStaticMarkup(el)
// The visible text, tags removed, so assertions read like the screen.
const text = (el: ReactElement) =>
  html(el)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .trim()
const count = (markup: string, re: RegExp) => (markup.match(re) ?? []).length
const noop = vi.fn()
// Clickable rows navigate with the app router, which only exists inside Next.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

describe('Button', () => {
  it('is a .btn with the variant and size classes', () => {
    expect(html(<Button>Go</Button>)).toBe('<button class="btn">Go</button>')
    expect(html(<Button variant="primary">Go</Button>)).toContain('class="btn p"')
    expect(html(<Button variant="dark" size="lg">Go</Button>)).toContain('class="btn d lg"')
    expect(html(<Button variant="ghost" size="s">Go</Button>)).toContain('class="btn g s"')
  })
  it('danger is the ghost button with red text', () => {
    const m = html(<Button danger>End campaign now</Button>)
    expect(m).toContain('class="btn g"')
    expect(m).toContain(`style="color:${tokens.red}"`)
    expect(m).toContain('End campaign now')
  })
  it('forwards native button props', () => {
    const m = html(
      <Button variant="primary" type="submit" disabled name="go" className="extra" aria-label="Save">
        Save
      </Button>,
    )
    expect(m).toContain('type="submit"')
    expect(m).toContain('disabled=""')
    expect(m).toContain('name="go"')
    expect(m).toContain('aria-label="Save"')
    expect(m).toContain('class="btn p extra"')
  })
  it('LinkButton is a link with the same classes', () => {
    const m = html(
      <LinkButton href="/app/campaigns/new" variant="primary">
        + New campaign
      </LinkButton>,
    )
    expect(m).toMatch(/^<a [^>]*class="btn p"/)
    expect(m).toContain('href="/app/campaigns/new"')
    expect(m).toContain('+ New campaign')
  })
})

describe('StatusBadge', () => {
  it.each([
    ['live', 'Live'],
    ['review', 'In review'],
    ['scheduled', 'Scheduled'],
    ['paused', 'Paused'],
    ['rejected', 'Rejected'],
    ['ended', 'Ended'],
    ['draft', 'Draft'],
    ['paid', 'Paid'],
    ['due', 'Due'],
    ['overdue', 'Overdue'],
    ['issued', 'Open'],
    ['pending', 'Pending approval'],
    ['approved', 'Approved'],
    ['declined', 'Declined'],
  ] as const)('%s reads "%s"', (status, label) => {
    expect(html(<StatusBadge status={status} />)).toBe(`<span class="st st-${status}">${label}</span>`)
  })
})

describe('MetricCard', () => {
  it('renders title with the green dot, value, line and sub', () => {
    const m = html(<MetricCard title="Impressions" value="57.6k" sub="3.4k today" fill={55} />)
    expect(m).toMatch(/^<div class="mc">/)
    expect(m).toContain('<div class="t">Impressions<i></i></div>')
    expect(m).toContain('<div class="v">57.6k</div>')
    expect(m).toContain('<div class="ln"><i style="width:55%"></i></div>')
    expect(m).toContain('<div class="f"><span>3.4k today</span></div>')
  })
  it('fills the line fully by default and clamps to 0–100', () => {
    expect(html(<MetricCard title="T" value="1" sub="s" />)).toContain('width:100%')
    expect(html(<MetricCard title="T" value="1" sub="s" fill={140} />)).toContain('width:100%')
    expect(html(<MetricCard title="T" value="1" sub="s" fill={-5} />)).toContain('width:0%')
  })
  it('shows "Open ›" when given a link', () => {
    const m = html(<MetricCard title="T" value="1" sub="s" openHref="/app/billing" />)
    expect(m).toContain('href="/app/billing"')
    expect(m).toContain('Open ›')
  })
})

describe('Box', () => {
  it('is a white panel with an optional h3 and sub-line', () => {
    const m = html(
      <Box title="Impressions per day" sub="$167 left over 8 days.">
        <p>body</p>
      </Box>,
    )
    expect(m).toBe('<div class="box"><h3>Impressions per day</h3><p class="sub">$167 left over 8 days.</p><p>body</p></div>')
    expect(html(<Box>only</Box>)).toBe('<div class="box">only</div>')
  })
})

describe('FilterPills', () => {
  it('renders pressed pills with counts', () => {
    const m = html(
      <FilterPills
        options={[
          { key: 'all', label: 'All', count: 3 },
          { key: 'live', label: 'Live', count: 1 },
        ]}
        value="live"
        onChange={noop}
      />,
    )
    expect(m).toMatch(/^<div class="pills">/)
    expect(m).toContain('<button type="button" class="pill" aria-pressed="false">All<i>3</i></button>')
    expect(m).toContain('<button type="button" class="pill" aria-pressed="true">Live<i>1</i></button>')
  })
})

describe('KVGrid', () => {
  it('renders label/value cells', () => {
    const m = html(
      <KVGrid
        items={[
          { label: 'Billing currency', value: 'NGN' },
          { label: 'Terms', value: 'Net 14' },
        ]}
      />,
    )
    expect(m).toBe(
      '<div class="kv"><div><small>Billing currency</small><b>NGN</b></div><div><small>Terms</small><b>Net 14</b></div></div>',
    )
  })
})

describe('EstimatePanel', () => {
  it('renders the label, the big number, the note and the rows', () => {
    const m = html(
      <EstimatePanel
        label="Estimated impressions"
        big="200.0k"
        note="about 14.3k a day for 14 days · ~7.2k opens"
        rows={[
          { label: 'Wall card · Nigeria', value: '$1.20 per 1,000' },
          { label: 'Rewards cap', value: '20% of budget' },
        ]}
      />,
    )
    expect(m).toMatch(/^<div class="est"><small>Estimated impressions<\/small><b>200.0k<\/b><small>about 14.3k/)
    expect(m).toContain('<div class="r"><span>Wall card · Nigeria</span><span>$1.20 per 1,000</span></div>')
    expect(m).toContain('<div class="r"><span>Rewards cap</span><span>20% of budget</span></div>')
  })
  it('has no rows block without rows', () => {
    expect(html(<EstimatePanel label="Points" big="2.1k" />)).toBe('<div class="est"><small>Points</small><b>2.1k</b></div>')
  })
})

describe('Steps', () => {
  it('numbers each step', () => {
    const m = html(
      <Steps
        steps={[
          { title: 'Share', body: 'A Phoenix user taps Share.' },
          { title: 'Friend opens and claims', body: 'The friend lands on your offer.' },
        ]}
      />,
    )
    expect(m).toMatch(/^<div class="steps">/)
    expect(m).toContain('<div class="step"><b><i>1</i>Share</b><p>A Phoenix user taps Share.</p></div>')
    expect(m).toContain('<b><i>2</i>Friend opens and claims</b>')
  })
})

describe('HBarList', () => {
  it('sizes each bar against the whole and prints the display value', () => {
    const m = html(
      <HBarList
        rows={[
          { label: 'WhatsApp', value: 62, display: '62.0%' },
          { label: 'X', value: 38, display: '38.0%' },
        ]}
      />,
    )
    expect(count(m, /class="hbar"/g)).toBe(2)
    expect(m).toContain('<div class="hbar"><span class="lab">WhatsApp</span><div class="b"><i style="width:62%"></i></div><span class="v">62.0%</span></div>')
    expect(m).toContain('width:38%')
  })
  it('takes an explicit max and draws nothing against zero', () => {
    expect(html(<HBarList rows={[{ label: 'SMS', value: 5, display: '5' }]} max={20} />)).toContain('width:25%')
    expect(html(<HBarList rows={[{ label: 'SMS', value: 0, display: '0' }]} />)).toContain('width:0%')
  })
})

describe('Leaderboard', () => {
  it('ranks sharers with masked phones and claims', () => {
    const m = html(<Leaderboard rows={[{ phone: '+234 80• ••• 4471', claims: 37 }, { phone: '+254 71• ••• 902', claims: 1 }]} />)
    expect(m).toContain('<div class="lead"><span class="rk">1</span><span class="ph">+234 80• ••• 4471</span><span class="v">37 claims</span></div>')
    expect(m).toContain('<span class="rk">2</span>')
    expect(m).toContain('<span class="v">1 claim</span>')
  })
  it('says so when nobody has shared', () => {
    expect(text(<Leaderboard rows={[]} />)).toBe('No shares yet.')
  })
})

describe('Funnel', () => {
  it('draws bars at max(2, value/base × 50)% and prints the fmt value', () => {
    const m = html(
      <Funnel
        base={57600}
        rows={[
          { label: 'Saw the card', value: 57600 },
          { label: 'Opened it', value: 3400 },
          { label: 'Friend claimed', value: 10 },
        ]}
      />,
    )
    expect(m).toMatch(/^<div class="fun">/)
    expect(m).toContain('<div><span class="lab">Saw the card</span><span class="fb" style="width:50%"></span><span class="val">57.6k</span></div>')
    expect(m).toMatch(/<span class="lab">Opened it<\/span><span class="fb" style="width:2\.95\d*%"><\/span><span class="val">3\.4k<\/span>/)
    expect(m).toContain('<span class="lab">Friend claimed</span><span class="fb" style="width:2%"></span><span class="val">10</span>')
  })
  it('keeps the 2% floor when nothing was seen', () => {
    expect(html(<Funnel base={0} rows={[{ label: 'Saw the card', value: 0 }]} />)).toContain('width:2%')
  })
})

describe('BarChart14d', () => {
  const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 57600]
  it('draws 14 bars, today in the accent and the rest grey', () => {
    const m = html(<BarChart14d values={values} />)
    expect(m).toMatch(/^<svg class="chart" viewBox="0 0 700 170" preserveAspectRatio="none">/)
    const rects = m.match(/<rect [^>]*>/g) ?? []
    expect(rects).toHaveLength(14)
    expect(rects[13]).toContain('fill="#FF5A1F"')
    for (const r of rects.slice(0, 13)) expect(r).toContain(`fill="${tokens.chartPast}"`)
    expect(rects[13]).toContain('rx="4"')
    expect(rects[13]).toMatch(/width="39\.14\d*"/)
  })
  it('labels the days and gives each bar a fmt tooltip', () => {
    const m = html(<BarChart14d values={values} />)
    const labels = [...m.matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map((x) => x[1])
    expect(labels).toEqual([...Array.from({ length: 13 }, (_, i) => `-${13 - i}d`), 'today'])
    expect(m).toContain('<title>57.6k</title>')
    expect(m).toContain('<title>10</title>')
  })
  it('pads a short series with empty days so today stays last', () => {
    const m = html(<BarChart14d values={[5]} />)
    expect(count(m, /<rect /g)).toBe(14)
    expect(count(m, /<title>0<\/title>/g)).toBe(13)
    expect(m).toMatch(/<rect [^>]*fill="#FF5A1F"[^>]*><title>5<\/title>/)
  })
})

const card: CardModel = {
  headline: 'Buy 2 bottles, get 1 free',
  brand: 'Kola Bright',
  country: 'Nigeria',
  status: 'live',
  placement: 'video',
  ageGated: true,
  color: tokens.tileColors[0],
  initials: 'KB',
  daysLeft: 8,
  mainLeft: '57.6k impressions',
  mainRight: '6.1% open rate',
  spendPct: 44,
}

describe('CampaignCard', () => {
  it('is a link with the cover overlays, body and spend bar', () => {
    const m = html(<CampaignCard campaign={card} href="/app/campaigns/c1" />)
    expect(m).toMatch(/^<a [^>]*class="cc"/)
    expect(m).toContain('href="/app/campaigns/c1"')
    expect(m).toContain(`<div class="cv" style="background:${tokens.tileColors[0]}"><span class="ph">KB</span>`)
    expect(m).toContain('<span class="st st-live">Live</span>')
    expect(m).toContain('<span class="age">18+</span>')
    expect(m).toContain('<span class="plb">Video ▶</span>')
    expect(m).toContain('<div class="t">Buy 2 bottles, get 1 free</div>')
    expect(m).toContain('<div class="b">Kola Bright · Nigeria · 8d left</div>')
    expect(m).toContain('<div class="row"><b>57.6k impressions</b><span>6.1% open rate</span></div>')
    expect(m).toContain('<div class="bar"><i style="width:44%"></i></div>')
  })
  it('shows the image instead of initials, and leaves out what is not given', () => {
    const m = html(
      <CampaignCard
        campaign={{
          ...card,
          status: 'review',
          placement: 'featured',
          ageGated: false,
          imageUrl: '/uploads/a.jpg',
          daysLeft: undefined,
          mainLeft: 'Awaiting approval',
          mainRight: undefined,
          spendPct: undefined,
        }}
      />,
    )
    expect(m).toMatch(/^<div class="cc" data-static="" style="cursor:default">/)
    expect(m).toContain('<div class="cv" style="background-image:url(&quot;/uploads/a.jpg&quot;)"><span class="st st-review">In review</span>')
    expect(m).not.toContain('class="ph"')
    expect(m).not.toContain('class="age"')
    expect(m).toContain('<span class="plb">Featured tile</span>')
    expect(m).toContain('<div class="b">Kola Bright · Nigeria</div>')
    expect(m).toContain('<div class="row"><b>Awaiting approval</b><span></span></div>')
    expect(m).not.toContain('class="bar"')
  })
  it('hides the pill without a status and the bold value when mainLeft is empty (form preview)', () => {
    const m = html(<CampaignCard campaign={{ ...card, status: null, mainLeft: '', mainRight: 'Claim code in store' }} />)
    expect(m).not.toContain('class="st ')
    expect(m).toContain('<div class="row"><span>Claim code in store</span></div>')
  })
  it("the form preview's flight length and pill text", () => {
    const m = html(<CampaignCard campaign={{ ...card, status: null, daysLeft: undefined, flightDays: 14, placement: 'splash', placementLabel: 'Splash ▶' }} />)
    expect(m).toContain('<div class="b">Kola Bright · Nigeria · 14d</div>')
    expect(m).toContain('<span class="plb">Splash ▶</span>')
  })
  it('clamps the spend bar at 100%', () => {
    expect(html(<CampaignCard campaign={{ ...card, spendPct: 108 }} />)).toContain('<i style="width:100%"></i>')
  })
})

const hero: HeroModel = {
  status: 'live',
  country: 'Nigeria',
  placement: 'featured',
  endsOn: '21 Nov',
  startsOn: '7 Nov',
  headline: 'Buy 2 bottles, get 1 free',
  brand: 'Kola Bright',
  name: 'Buy 2 get 1 — November',
  color: tokens.tileColors[0],
  initials: 'KB',
  stats: {
    impressions: '57.6k',
    today: '3.4k',
    openRate: '6.1%',
    opened: '3.5k',
    shareClaims: '209',
    shared: '317',
    rewards: '$7',
    left: '$167',
    budget: '$300',
  },
  spendPct: 44.5,
  note: 'On pace.',
}

describe('HeroCampaignCard', () => {
  it('renders the art, eyebrow, headline, stats, actions and note', () => {
    const m = html(
      <HeroCampaignCard model={hero}>
        <Button variant="dark" size="lg">
          Open campaign
        </Button>
      </HeroCampaignCard>,
    )
    expect(m).toMatch(/^<div class="hero">/)
    expect(m).toContain(`<div class="art" style="background:${tokens.tileColors[0]}"><span class="ph">KB</span></div>`)
    expect(m).toContain('<div class="eyebrow"><span class="st st-live">Live</span><span>Nigeria · Featured tile · ends 21 Nov</span></div>')
    expect(m).toContain('<h2>Buy 2 bottles, get 1 free</h2>')
    expect(m).toContain('<p class="brand2">Kola Bright · Buy 2 get 1 — November</p>')
    expect(m).toContain('<div><small>Impressions</small><b>57.6k</b><em>3.4k today</em></div>')
    expect(m).toContain('<div><small>Open rate</small><b>6.1%</b><em>3.5k opened</em></div>')
    expect(m).toContain('<div><small>Shares → claims</small><b>209</b><em>317 shared · $7 rewards</em></div>')
    expect(m).toContain('<div><small>Budget</small><b>$167</b><em>left of $300</em><div class="pace"><span style="width:44.5%"></span></div></div>')
    expect(m).toContain('<div class="acts"><button class="btn d lg">Open campaign</button><span class="note">On pace.</span></div>')
  })
  it('says when it starts, or that it awaits approval', () => {
    expect(text(<HeroCampaignCard model={{ ...hero, status: 'scheduled', startsOn: '16 Nov' }} />)).toContain(
      'Nigeria · Featured tile · starts 16 Nov',
    )
    expect(text(<HeroCampaignCard model={{ ...hero, status: 'review' }} />)).toContain('Nigeria · Featured tile · awaiting approval')
    expect(text(<HeroCampaignCard model={{ ...hero, status: 'paused', placement: 'video' }} />)).toContain(
      'Nigeria · Video · ends 21 Nov',
    )
  })
  it('shows the creative on the art panel when there is one', () => {
    const m = html(<HeroCampaignCard model={{ ...hero, imageUrl: '/uploads/supa10.jpg' }} />)
    expect(m).toContain('<div class="art" style="background-image:url(&quot;/uploads/supa10.jpg&quot;)"></div>')
  })
})

describe('NewCampaignTile', () => {
  it('is the dashed tile linking to the form', () => {
    const m = html(<NewCampaignTile />)
    expect(m).toMatch(/^<a [^>]*class="cc new"/)
    expect(m).toContain('href="/app/campaigns/new"')
    expect(text(<NewCampaignTile />)).toBe('+ New campaign')
  })
})

describe('EmptyState', () => {
  it('renders the optional h3 and the line', () => {
    expect(html(<EmptyState title="Nothing on Phoenix yet">Create your first offer. It takes about five minutes.</EmptyState>)).toBe(
      '<div class="empty"><h3>Nothing on Phoenix yet</h3>Create your first offer. It takes about five minutes.</div>',
    )
    expect(html(<EmptyState>Nothing waiting.</EmptyState>)).toBe('<div class="empty">Nothing waiting.</div>')
    expect(html(<EmptyState box>Nothing waiting.</EmptyState>)).toBe('<div class="box empty">Nothing waiting.</div>')
  })
})

describe('OptionTile', () => {
  it('is a pressable tile with title, description and price', () => {
    const m = html(<OptionTile pressed title="Wall card" desc="A card in the Offers grid" big="$1.20 CPM" onClick={noop} />)
    expect(m).toBe(
      '<button type="button" class="opt" aria-pressed="true"><b>Wall card</b><span>A card in the Offers grid</span><span class="big">$1.20 CPM</span></button>',
    )
  })
  it('flags placements whose inventory is not confirmed', () => {
    const m = html(<OptionTile pressed={false} title="Video" desc="6–15s clip" big="$4.50 CPM" soon />)
    expect(m).toContain('aria-pressed="false"')
    // After the title, so the tile's name starts with its placement; CSS puts it on the top edge.
    expect(m).toContain('<b>Video</b><span class="soon">inventory TBC</span>')
  })
})

describe('Swatches', () => {
  it('renders one pressed colour button per colour', () => {
    const m = html(<Swatches colors={tokens.tileColors} value={tokens.tileColors[2]} onChange={noop} />)
    expect(m).toMatch(/^<div class="swatches">/)
    expect(count(m, /<button /g)).toBe(7)
    expect(count(m, /aria-label="colour"/g)).toBe(7)
    expect(count(m, /aria-pressed="true"/g)).toBe(1)
    expect(m).toContain(`<button type="button" aria-label="colour" aria-pressed="true" style="background:${tokens.tileColors[2]}"></button>`)
  })
})

describe('ToggleRow', () => {
  it('renders the label, sub-line and an accessible switch', () => {
    const m = html(<ToggleRow label="Weekly digest" sub="Every Monday, all campaigns" checked onChange={noop} />)
    expect(m).toMatch(/^<div class="tog">/)
    expect(text(<ToggleRow label="Weekly digest" sub="Every Monday, all campaigns" checked onChange={noop} />)).toBe(
      'Weekly digest Every Monday, all campaigns',
    )
    expect(m).toMatch(/<button type="button" class="sw" role="switch" aria-checked="true" aria-labelledby="[^"]+"/)
    expect(html(<ToggleRow label="L" sub="S" checked={false} onChange={noop} />)).toContain('aria-checked="false"')
  })
})

describe('AlertBox', () => {
  it('is the red-bordered box with a bold red lead', () => {
    const m = html(<AlertBox lead="Credit limit reached.">Live campaigns pause until an invoice is paid or Global raises the limit.</AlertBox>)
    expect(m).toBe(
      `<div class="box" style="border-color:${tokens.red};background:${tokens.redSoft}"><b style="color:${tokens.red}">Credit limit reached.</b> Live campaigns pause until an invoice is paid or Global raises the limit.</div>`,
    )
  })
})

describe('TokenChip', () => {
  it('is the monospace chip', () => {
    expect(html(<TokenChip>PHX-K4Q7-7A2</TokenChip>)).toBe('<span class="tok">PHX-K4Q7-7A2</span>')
  })
})

describe('DataTable', () => {
  it('renders the head and the rows', () => {
    const m = html(
      <DataTable
        head={['Date', 'Description', 'USD']}
        align={[undefined, undefined, 'right']}
        rows={[['3 Nov', 'Buy 2 get 1 — delivery', '−$118']]}
        emptyText="No charges yet."
      />,
    )
    expect(m).toContain('<thead><tr><th>Date</th><th>Description</th><th style="text-align:right">USD</th></tr></thead>')
    expect(m).toContain('<tbody><tr><td>3 Nov</td><td>Buy 2 get 1 — delivery</td><td style="text-align:right">−$118</td></tr></tbody>')
    expect(m).not.toContain('No charges yet.')
  })
  it('shows the empty text across every column', () => {
    const m = html(<DataTable head={['Date', 'Description', 'USD', 'NGN']} rows={[]} emptyText="No charges yet." />)
    expect(m).toContain(`<tr><td colSpan="4" style="color:${tokens.ink3}">No charges yet.</td></tr>`)
  })
  it('makes rows clickable with rowHref or onRowClick', () => {
    const rows = [['Supa10'], ['Kwik']]
    expect(count(html(<DataTable head={['Campaign']} rows={rows} emptyText="-" rowHref={(i) => `/app/campaigns/${i}`} />), /<tr class="row"/g)).toBe(2)
    expect(count(html(<DataTable head={['Campaign']} rows={rows} emptyText="-" onRowClick={noop} />), /<tr class="row"/g)).toBe(2)
    expect(html(<DataTable head={['Campaign']} rows={rows} emptyText="-" />)).not.toContain('class="row"')
  })
  it('leaves out the head when there are no headings', () => {
    expect(html(<DataTable head={[]} rows={[['Owner', 'Everything']]} emptyText="-" />)).not.toContain('<thead>')
  })
})

describe('CreativeMedia', () => {
  const labels = { image: "The campaign's image", video: "The campaign's video" }
  const m = (el: ReactElement) => renderToStaticMarkup(el)

  it('inline: the image, or the video with its controls from the first frame, or what stands in for none', () => {
    // (Rendered alone, React also hints a preload for the image.)
    expect(m(<CreativeMedia image="/uploads/a.jpg" video={null} labels={labels} className="cr" />)).toMatch(
      /<img src="\/uploads\/a.jpg" alt="The campaign&#x27;s image" class="cr"\/>$/,
    )
    expect(m(<CreativeMedia image={null} video="/uploads/a.mp4" labels={labels} controls className="cr" />)).toBe(
      '<video src="/uploads/a.mp4#t=0.1" aria-label="The campaign&#x27;s video" controls="" playsInline="" preload="metadata" class="cr"></video>',
    )
    expect(m(<CreativeMedia image={null} video={null} labels={labels} fallback={<p>None</p>} />)).toBe('<p>None</p>')
  })

  it('a still video is muted and has no controls', () => {
    expect(m(<CreativeMedia image={null} video="/uploads/a.mp4" labels={labels} />)).toBe(
      '<video src="/uploads/a.mp4#t=0.1" aria-label="The campaign&#x27;s video" muted="" playsInline="" preload="metadata"></video>',
    )
  })

  it('a cover: the image or the tile colour as its background, a video filling it, the initials only over the colour', () => {
    const cover = (image: string | null, video: string | null) =>
      m(<CreativeMedia image={image} video={video} labels={labels} color="#0F766E" className="cv" fallback="KB"><i>pill</i></CreativeMedia>)
    expect(cover('/uploads/a.jpg', null)).toBe('<div class="cv" style="background-image:url(&quot;/uploads/a.jpg&quot;)"><i>pill</i></div>')
    expect(cover(null, null)).toBe('<div class="cv" style="background:#0F766E">KB<i>pill</i></div>')
    expect(cover(null, '/uploads/a.mp4')).toBe(
      '<div class="cv" style="background:#0F766E"><video src="/uploads/a.mp4#t=0.1" aria-label="The campaign&#x27;s video" muted="" playsInline="" preload="metadata"></video><i>pill</i></div>',
    )
  })
})
