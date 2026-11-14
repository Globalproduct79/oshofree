// The Sharing page's words (ADV §5), verbatim; the product name is OshoFree, not OfferGrid.
export const SHARING = {
  crumb: 'Sharing',
  growth: 'Growth',
  title: 'Sharing',
  lead: 'Phoenix users share your offers with a unique token. When a friend opens and claims, the sharer earns airtime and points, paid from your budget.',
  kpi: {
    shares: { title: 'Shares', sub: (n: number) => `across ${n} ${n === 1 ? 'campaign' : 'campaigns'}` },
    opened: { title: 'Friends opened', sub: (x: string) => `viral coefficient ${x}` },
    claimed: { title: 'Friends claimed', sub: (pct: string) => `${pct} of friend opens` },
    rewards: { title: 'Rewards paid', sub: 'airtime via aggregator' },
  },
  how: {
    title: 'How a share works',
    sub: 'Three steps. The token is what makes it measurable and makes the reward fair.',
    shareTitle: 'Share',
    share: {
      before: 'A Phoenix user taps Share on your offer. We mint a token like ',
      token: 'PHX-K4Q7-7A2',
      after: ' tied to their device and phone number (OTP, first time only). The link goes out on WhatsApp, X, Facebook or SMS.',
    },
    claimTitle: 'Friend opens and claims',
    claim: {
      before: "The friend lands on your offer with the token. If they take a code or click through, that's a ",
      token: 'share_claim',
      after: ' event. Opens alone earn nothing.',
    },
    earnTitle: 'Sharer earns',
    earn: (points: number) =>
      `Airtime you set per campaign, sent by Reloadly within minutes, plus ${points} OshoFree points toward the loyalty layer. Capped per sharer per day and at 20% of your budget.`,
  },
  byCampaign: {
    title: 'By campaign',
    head: ['Campaign', 'Shares', 'Friend opens', 'Friend claims', 'Viral', 'Rewards'],
  },
  where: { title: 'Where people share', sub: 'Tagged on the token, so you know which platform works.' },
  points: {
    title: 'Points issued',
    label: 'OshoFree points',
    note: (perShare: number) => `${perShare} per successful share · redeemable when the loyalty layer launches`,
  },
} as const
