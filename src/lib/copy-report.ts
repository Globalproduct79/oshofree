import type { RedeemMethod } from '@prisma/client'
import { CAMPAIGN_FORM_COPY } from '@/lib/copy-campaign-form'
import { COMPONENTS } from '@/lib/copy-components'

// The campaign page and the Phoenix preview, split out of copy.ts. Reached through COPY.campaign/preview.

// The campaign page (ADV §2), verbatim. Ours, and marked so: the rejected chart sub-line (spec §6.8),
// the revision status lines (spec §6.14.3), the End now confirm's buttons, the refusals the prototype
// never had, and the History box.
export const CAMPAIGN_COPY = {
  crumb: 'Campaigns',
  // "Kola Bright · Nigeria · Featured tile · 7 Nov – 21 Nov"
  lead: (brand: string, country: string, placement: string, start: string, end: string) =>
    `${brand} · ${country} · ${placement} · ${start} – ${end}`,
  seeOnPhoenix: 'See it on Phoenix',
  back: '← Campaigns',
  // Ours (Prompt 10): Global opening a campaign's address while in another workspace (or on Platform).
  elsewhere: {
    lead: (workspace: string) => `This campaign is in ${workspace}. Enter ${workspace} to open it there.`,
    enter: (workspace: string) => `Enter ${workspace}`,
  },
  status: {
    review: 'Global usually decides within one working day',
    // After the badge, which says the status word: "Live · a revised offer is in review".
    revisionInReview: '· a revised offer is in review',
    revisionRejected: (reason: string) => (reason ? `· revised offer not approved: ${reason}` : '· revised offer not approved'),
    // Ours (Prompt 5): the daily job paused it at the credit limit, so Resume is refused until the limit is back.
    pausedOverCredit: '· credit limit reached — resumes once an invoice is paid or Global raises the limit',
  },
  kpi: {
    impressions: 'Impressions',
    today: (n: string) => `${n} today`,
    openRate: 'Open rate',
    opened: (n: string) => `${n} opened`,
    claims: { code: 'Claim codes', link: 'Clicks to you' } satisfies Record<RedeemMethod, string>,
    // Spend (rewards included) ÷ claims, in dollars and cents.
    each: (dollars: string) => `$${dollars} each`,
    none: '—',
    spent: 'Spent',
    spentOf: (budget: string, rewards: string) => `of ${budget} · ${rewards} in rewards`,
  },
  daily: {
    title: 'Impressions per day',
    left: (left: string, days: number) => `${left} left over ${days} days.`,
    paused: 'Paused — not delivering.',
    review: 'Starts once approved.',
    scheduled: 'Scheduled.',
    ended: 'Finished.',
    // The prototype fell through to "Scheduled." here (D6).
    rejected: 'Not approved.',
  },
  funnel: {
    title: 'What consumers did',
    saw: 'Saw the card',
    opened: 'Opened it',
    claimed: { code: 'Took a claim code', link: 'Clicked to your site' } satisfies Record<RedeemMethod, string>,
    shared: 'Shared it',
    friendClaimed: 'Friend claimed',
  },
  sharingBox: {
    title: 'Sharing',
    // "A sharer earns ₦50 airtime and 10 points …"
    sub: (reward: string, points: number, capPct: number) =>
      `A sharer earns ${reward} airtime and ${points} points when a friend opens their link and claims. Capped at ${capPct}% of budget.`,
    shares: 'Shares',
    fromOpens: (n: string) => `from ${n} opens`,
    friendsOpened: 'Friends opened',
    viral: (v: string) => `viral coefficient ${v}`,
    friendsClaimed: 'Friends claimed',
    ofOpens: (p: string) => `${p} of opens`,
    rewardsPaid: 'Rewards paid',
    airtime: (local: string) => `${local} airtime`,
    where: 'Where it was shared',
    top: 'Top sharers (anonymised)',
  },
  change: {
    title: 'Change without review',
    sub: 'Money and timing. Applied within 15 minutes.',
    budget: 'Budget (USD)',
    endDate: 'End date',
    reward: (currency: string) => `Share reward (${currency} airtime per successful share)`,
    save: 'Save changes',
    end: 'End campaign now',
    // The styled confirm (spec §6.3) asks CAMPAIGN.endConfirm; its buttons are ours.
    endConfirm: 'End now',
    cancel: 'Cancel',
    // Refusals the prototype never reached: it checked neither the dates nor the numbers.
    endBeforeStart: 'The end date must be after the start and after today.',
    invalid: 'Use whole numbers for the budget and reward, and a real end date.',
    // The credit limit's sibling (ADVERTISERS.errors.tooLarge): past the largest limit a workspace can have.
    budgetTooLarge: 'That budget is too large.',
    rewardTooLarge: CAMPAIGN_FORM_COPY.validation.rewardTooLarge,
  },
  offer: {
    title: 'The offer',
    sub: 'Changing any of this sends the campaign back to review. The current version keeps running until the new one is approved.',
    headline: 'Headline',
    redeem: 'Redeem',
    redeemAs: { code: 'Code in store', link: 'Link' } satisfies Record<RedeemMethod, string>,
    category: 'Category',
    placement: 'Placement',
    // "Featured tile · $2.20": the CPM in dollars.
    placementAt: (placement: string, cpmDollars: string) => `${placement} · $${cpmDollars}`,
    edit: 'Edit offer and resubmit',
    // Ours: the creative the offer runs, as a screen reader names it.
    creative: COMPONENTS.creative,
  },
  // Ours (spec §6.8): Global's decisions on the campaign and its revised offers, newest first.
  history: {
    title: 'History',
    // Ours (Prompt 6): the box's sub-line, over the decisions; a campaign from before creators were recorded has none.
    created: (name: string, date: string) => `Created by ${name} on ${date}`,
    empty: 'No decisions yet.',
    line: (date: string, what: string) => `${date} · ${what}`,
    approved: 'Approved by Global',
    rejected: (reason: string) => (reason ? `Rejected: ${reason}` : 'Rejected'),
    revisionApproved: 'Revised offer approved',
    revisionRejected: (reason: string) => (reason ? `Revised offer not approved: ${reason}` : 'Revised offer not approved'),
  },
} as const

export const PREVIEW_COPY = {
  button: 'Preview on Phoenix',
  title: 'On Phoenix',
  // Ours (Prompt 7): the preview has a tab per format, so the prototype's sub-line moved to the Wall card tab.
  subtitle: 'Every format this offer can run in, its page and its share sheet, drawn from the campaign as it stands.',
  explainer:
    'The Phoenix user opens Offers, taps your card and either takes a claim code or is sent to your link. If they share it, the friend lands on the same offer with a token; when the friend claims, the sharer earns airtime and points. Each step shows up in your report within the hour.',
  offers: 'Offers',
  all: 'All',
  url: 'phoenix://offers',
  skip: 'Skip',
  caption: (placement: string, brand: string, ageGated: boolean) =>
    `${placement} · ${brand} · Sponsored${ageGated ? ' · 18+' : ''}`,
  tileBrand: (brand: string) => `${brand} · Sponsored`,
  headline: 'Your headline',
  featuredLabel: 'Featured',
  splashLabel: 'Splash',
  loading: 'Loading the offers live now…',
  failed: "The live offers didn't load, so your card is shown on its own.",
  close: 'Close',
  // Ours (Prompt 7): the format tabs. A placement other than the campaign's is shown, off, saying why.
  tabsLabel: 'Formats',
  tabs: { landing: 'Landing page', share: 'Share' },
  notThisPlacement: 'Not this placement',
  // One line per tab, beside the phone. The Wall card's is the prototype's sub-line, verbatim.
  lines: {
    card: 'Your card, outlined, among the offers live in this country right now.',
    featured: 'Your tile, outlined, across the top of the Offers wall, above the offers live in this country right now.',
    video: 'Your clip in the featured slot, outlined, at its first frame. Play it here as it will run.',
    splash: 'Your splash fills the screen when Phoenix opens, once a day, with Skip in the corner.',
    landing: 'The page a friend opens from a shared link: your offer, its reward and the claim button, then Share and earn.',
    share: 'What a sharer sees once they leave their number: a link of their own for WhatsApp, SMS or X, or to copy.',
  },
  clip: 'Your clip, as it will play',
  inert: 'Nothing you press here is recorded: no visit, claim, code or link is made.',
  landingFrame: 'The landing page',
  shareFrame: 'The share sheet',
  message: 'The message their buttons send',
  sample: 'Each sharer gets a link of their own. This one is a sample and opens nothing.',
} as const

// The words lib/reports.ts builds into its data: the campaign card's main row (ADV §1 "CampaignCard
// anatomy"), the medium labels and a sharer Phoenix gave no phone for (spec §6.14.1).
export const REPORT_COPY = {
  card: {
    awaiting: 'Awaiting approval',
    starts: (date: string) => `Starts ${date}`,
    notApproved: 'Not approved',
    impressions: (n: string) => `${n} impressions`,
    openRate: (rate: string) => `${rate} open rate`,
  },
  via: { whatsapp: 'WhatsApp', facebook: 'Facebook', x: 'X', sms: 'SMS' },
  phoenixUser: (sessionTail: string) => `Phoenix user · ••${sessionTail}`,
} as const
