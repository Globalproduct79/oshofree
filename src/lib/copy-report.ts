// Home, the campaign page and the Phoenix preview, split out of copy.ts. Reached through COPY.home/campaign/preview.

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`

export const HOME_COPY = {
  empty: 'No campaigns yet. Your first one takes about five minutes.',
  newCampaign: 'New campaign',
  nothing: 'Nothing here right now.',
  open: 'Open campaign',
  filters: { all: 'All', live: 'Live', review: 'In review', paused: 'Paused', ended: 'Ended' },
  filterLabel: 'Filter campaigns by status',
  tiles: {
    impressions: 'Impressions',
    today: (n: string) => `${n} today`,
    opens: 'Unique link opens',
    shares: 'Shares',
    claims: 'Claims',
  },
  pace: (day: number, total: number) => `Day ${day} of ${total}`,
  starts: (date: string, total: number) => `Starts ${date} · ${plural(total, 'day', 'days')}`,
  shares: (n: number) => plural(n, 'share', 'shares'),
} as const

// Channel facts carry the channel's short name: "Saw on Phoenix", not "Saw on Phoenix Browser".
const CHANNELS: Record<string, string> = { phoenix: 'Phoenix', boomplay: 'Boomplay' }

export const CAMPAIGN_COPY = {
  pause: 'Pause',
  resume: 'Resume',
  editAndResubmit: 'Edit and resubmit',
  editDraft: 'Edit draft',
  rejected: (reason: string) => `Global sent this back: ${reason.trim().replace(/[.!?]+$/, '')}.`,
  daily: {
    title: 'Last 14 days',
    saw: 'Saw on Phoenix',
    opened: 'Opened via link',
    claimedOnChannel: 'Claimed on Phoenix',
    claimedViaLink: 'Claimed via link',
  },
  funnel: {
    title: 'Funnel',
    subtitle: 'Facts from the channel say “on Phoenix”. Facts OshoFree counted itself say “via link”.',
    empty: 'The funnel starts once Global approves the campaign and it goes live on Phoenix.',
    saw: (ch: string) => `Saw on ${ch}`,
    opened: (ch: string) => `Opened on ${ch}`,
    claimed: 'Claimed',
    claimedParts: (ch: string, onChannel: string, viaLink: string) => `${onChannel} on ${ch} · ${viaLink} via link`,
    shared: 'Shared',
    friendOpened: 'Friend opened via link',
    friendClaimed: 'Friend claimed via link',
  },
  sharing: {
    title: 'Sharing',
    shares: 'Shares',
    friendOpens: 'Friend opens',
    friendClaims: 'Friend claims',
    detailsLeft: 'Details left',
    deepestChain: 'Deepest chain',
    viral: 'Viral coefficient',
    viralHint: 'Friend claims ÷ shares',
    none: '—',
    byChannel: 'By channel',
    byMedium: 'Shared via',
    channel: 'Channel',
    medium: 'Medium',
    noShares: 'No shares yet.',
    workspaceEmpty: 'No shares yet. Shares start when your first campaign goes live on Phoenix.',
    campaigns: 'Campaigns',
    campaign: 'Campaign',
    brand: 'Brand',
  },
  channel: (key: string) => CHANNELS[key] ?? key,
  via: { whatsapp: 'WhatsApp', sms: 'SMS', x: 'X', copy: 'Copy', other: 'Other', unknown: 'Unknown' },
} as const

export const PREVIEW_COPY = {
  button: 'Preview on Phoenix',
  title: 'On Phoenix',
  subtitle: 'Your card, outlined, among the offers live in this country right now.',
  explainer:
    'The Phoenix user opens Offers, taps your card and either takes a claim code or is sent to your link. If they share it, the friend lands on your offer page and can leave their number to get a link of their own. Every open, claim and share shows in your report straight away.',
  offers: 'Offers',
  all: 'All',
  loading: 'Loading the offers live now…',
  failed: "The live offers didn't load, so your card is shown on its own.",
  close: 'Close',
} as const
