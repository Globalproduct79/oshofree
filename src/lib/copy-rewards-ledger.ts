import { num } from '@/lib/format'

// Rewards ledger strings (GLB §2.5), verbatim; the controller's additions are marked.
export const REWARDS_LEDGER = {
  crumb: 'Rewards ledger',
  title: 'Rewards ledger',
  lead: 'Airtime and data owed to sharers, per campaign, and the aggregator balance that pays it.',
  kpi: {
    earnedTitle: 'Rewards earned',
    earnedSub: 'all campaigns, this month',
    sentTitle: 'Sent via aggregator',
    // Controller (Prompt 4): with anything held, its share is named too, so sent, queued and held make the whole.
    sentSub: (queued: string, held: string | null) => `${queued} still queued${held ? ` · ${held} held` : ''}`,
    balanceTitle: 'Aggregator balance',
    balanceLow: 'top up soon',
    balanceDays: (n: number) => `about ${num(n)} days at current rate`,
    // Controller: no rewards earned this month, so there is no rate to divide by.
    balanceIdle: 'no rewards earned yet this month',
    pointsTitle: 'Points issued',
    pointsSub: (n: number) => `${n} per successful share`,
  },
  campaignTitle: 'By campaign',
  campaignHead: ['Campaign', 'Advertiser', 'Successful shares', 'Per share', 'Owed', 'Recharged on invoice'],
  // Controller: the By campaign table before any reward is earned.
  empty: "No rewards yet. They appear as sharers' friends claim offers.",
  // The head's primary, and the title of its page (/admin/rewards/top-up).
  topUpTitle: 'Top up aggregator',
  topUpSub: 'Reloadly prepaid balance pays the airtime. Global funds it; advertisers are recharged on their invoice.',
  amountLabel: 'Amount (USD)',
  topUpButton: 'Top up',
  topUpToast: 'Aggregator topped up',
  // Controller: the top-up page's balance, beside the form.
  balanceNow: 'Balance now',
  // Controller's additions.
  invalidAmount: 'Enter an amount above zero.',
  // The balance is capped at what its column holds ($21,474,836.47).
  topUpTooLarge: 'That top-up is too large.',
  recentTitle: 'Recent top-ups',
  recentEmpty: 'No top-ups yet.',
  fraudTitle: 'Fraud checks',
  heldTitle: 'Held rewards',
  heldHead: ['Campaign', 'Sharer', 'Reward', 'Reason', 'Held'],
  heldEmpty: 'Nothing held.',
  // Ours (Prompt 8): a held reward's campaign links to that reward's line on the campaign page.
  seeActivity: "See this reward in the campaign's Recent activity",
  release: 'Release',
  reject: 'Reject',
  released: 'Reward released',
  rejected: 'Reward rejected',
  overCap: "Over the campaign's reward cap — raise the cap or reject.",
  alreadyHandled: 'That reward was already handled.',
  ruleOn: 'Check turned on',
  ruleOff: 'Check turned off',
  notFound: 'Reward not found.',
  reasons: {
    no_phone: 'No phone number',
    same_device: 'Same device',
    cap_per_sharer: "Over the sharer's daily cap",
    platform_cap: "Over the platform's daily cap",
    phone_reuse: 'Phone reused across sharers',
    cap: 'Over the campaign cap',
    manual: 'Rejected by Global',
  } as Record<string, string>,
} as const
