// The fixed strings the prototype's components print themselves (ADV §1 and §19, GLB §2.7 and
// §6.5). Everything else reaches a component through its props.

export const STATUS_LABEL = {
  live: 'Live',
  review: 'In review',
  scheduled: 'Scheduled',
  paused: 'Paused',
  rejected: 'Rejected',
  ended: 'Ended',
  draft: 'Draft',
  paid: 'Paid',
  due: 'Due',
  overdue: 'Overdue',
  issued: 'Open',
  pending: 'Pending approval',
  approved: 'Approved',
  // The prototype had no label for a declined workspace (D4); the spec names it "Declined".
  declined: 'Declined',
} as const

export type StatusKey = keyof typeof STATUS_LABEL

export const PLACEMENT_LABEL = {
  card: 'Wall card',
  featured: 'Featured tile',
  video: 'Video',
  splash: 'Splash',
} as const

export type PlacementKey = keyof typeof PLACEMENT_LABEL

export const COMPONENTS = {
  card: {
    // The cover's placement pill: ▶ is appended for video only.
    placement: (p: PlacementKey) => (p === 'video' ? `${PLACEMENT_LABEL[p]} ▶` : PLACEMENT_LABEL[p]),
    age: '18+',
    sub: (brand: string, country: string, daysLeft?: number) =>
      daysLeft === undefined ? `${brand} · ${country}` : `${brand} · ${country} · ${daysLeft}d left`,
    // The form preview's sub-line: the flight's length (ADV §3 "Card preview box").
    subFlight: (brand: string, country: string, days: number) => `${brand} · ${country} · ${days}d`,
  },
  hero: {
    eyebrow: (country: string, placement: PlacementKey, when: string) =>
      `${country} · ${PLACEMENT_LABEL[placement]} · ${when}`,
    ends: (date: string) => `ends ${date}`,
    starts: (date: string) => `starts ${date}`,
    awaiting: 'awaiting approval',
    brandLine: (brand: string, name: string) => `${brand} · ${name}`,
    impressions: 'Impressions',
    today: (n: string) => `${n} today`,
    openRate: 'Open rate',
    opened: (n: string) => `${n} opened`,
    shareClaims: 'Shares → claims',
    shared: (n: string, rewards: string) => `${n} shared · ${rewards} rewards`,
    budget: 'Budget',
    leftOf: (budget: string) => `left of ${budget}`,
  },
  metric: { open: 'Open ›' },
  newCampaign: '+ New campaign',
  leaderboard: {
    // The prototype printed "{n} claims" for every n; one reads "1 claim".
    claims: (n: number) => `${n} ${n === 1 ? 'claim' : 'claims'}`,
    empty: 'No shares yet.',
  },
  chart: {
    today: 'today',
    daysAgo: (n: number) => `-${n}d`,
  },
  option: { soon: 'inventory TBC' },
  swatch: 'colour',
  // The creative picker: its buttons, the upload's progress, and what a preview is called to a screen reader.
  drop: {
    replace: 'Replace',
    remove: 'Remove',
    retry: 'Retry',
    uploading: 'Uploading…',
    percent: (percent: number) => `${percent}%`,
    chosen: { image: 'The image you chose', video: 'The video you chose' },
  },
} as const
