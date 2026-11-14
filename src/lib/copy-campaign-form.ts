// The campaign form's words, split out of copy.ts to keep that file readable. Reached through COPY.campaignForm.
// The prototype's New campaign page (ADV §3) is the `head` … `toasts` keys, strings verbatim; the keys
// after them are ours (spec §6.3: custom flights, real uploads, Edit offer on a running campaign, and the
// server's refusals).
export const CAMPAIGN_FORM_COPY = {
  head: {
    new: {
      title: 'New campaign',
      lead: 'One form. Your offer goes live on Phoenix once Global approves it — usually within a working day.',
      crumb: ['Campaigns', 'New campaign'],
    },
    edit: {
      title: 'Edit offer',
      lead: 'Saving sends it back to review. The current version keeps running meanwhile.',
      crumb: ['Campaigns', 'Edit offer'],
    },
  },
  fields: {
    name: { label: 'Campaign name', hint: '— for you, not shown to consumers', placeholder: 'e.g. November buy-2-get-1' },
    brand: { label: 'Brand', hint: '— client' },
    country: { label: 'Country' },
    category: { label: 'Category' },
    tileColor: { label: 'Tile colour', hint: "— used when there's no image", swatch: 'colour' },
    headline: { label: 'Offer headline', counter: (n: number) => `— ${n}/48`, placeholder: 'Buy 2 bottles, get 1 free' },
    description: {
      label: 'What the consumer gets and how',
      hint: '— betting and draws: include the licence or approval number',
      placeholder: 'Buy any two 50cl at a participating store and get a third free. Show your claim code at the till.',
    },
    placement: { label: 'Placement', hint: '— video and splash subject to Phoenix inventory' },
    redeem: {
      label: 'How consumers redeem',
      options: { code: 'Claim code shown in store', link: 'Send them to our site / app' },
    },
    link: { label: 'Link', hint: '— online offers only', placeholder: 'https://' },
    budget: { label: 'Budget (USD)', hint: '— min $50' },
    runsFor: {
      label: 'Runs for',
      options: [
        { value: '7', label: '7 days' },
        { value: '14', label: '14 days' },
        { value: '30', label: '30 days' },
        { value: 'custom', label: 'Custom' },
      ],
    },
    startsAt: { label: 'Start date' },
    endsAt: { label: 'End date' },
    reward: { label: 'Share reward', hint: (currency: string) => `— ${currency} airtime per successful share` },
    terms: 'This offer is genuine, available in the country and dates above, and the brand will honour it.',
  },
  placements: {
    card: { name: 'Wall card', description: 'A card in the Offers grid', pill: 'Wall card' },
    featured: { name: 'Featured tile', description: 'Full-width tile at the top of the wall', pill: 'Featured tile' },
    video: { name: 'Video', description: '6–15s clip in the featured slot', pill: 'Video ▶' },
    splash: { name: 'Splash', description: 'Full-screen on Phoenix open, once a day', pill: 'Splash ▶' },
    inventoryTbc: 'inventory TBC',
    cpm: (dollars: string) => `$${dollars} CPM`,
  },
  drop: {
    card: {
      label: 'Ad image', hint: '— optional. Square or landscape works best.',
      zoneTitle: 'Upload image', zoneHint: 'tap to attach a sample (demo)',
    },
    featured: {
      label: 'Ad image', hint: '— optional. Square or landscape works best.',
      zoneTitle: 'Upload image', zoneHint: 'tap to attach a sample (demo)',
    },
    video: {
      label: 'Video clip', hint: '— MP4, 6–15 s, under 2 MB. Required.',
      zoneTitle: 'Upload creative', zoneHint: 'tap to attach a sample (demo)',
    },
    splash: {
      label: 'Splash creative', hint: '— portrait image or video, under 2 MB. Required.',
      zoneTitle: 'Upload creative', zoneHint: 'tap to attach a sample (demo)',
    },
    attached: 'Tap to remove',
  },
  validation: {
    name: 'Give the campaign a name.',
    brand: 'Which brand is this for?',
    headline: 'Write the offer headline.',
    description: 'Describe what the consumer gets.',
    licence: 'Betting and draw offers need a licence or approval number in the description.',
    link: 'Online offers need an https:// link.',
    creative: 'Video and splash need a creative attached.',
    budget: 'Minimum budget is $50.',
    startPast: "Start date can't be in the past.",
    flight: 'The flight must end after it starts and run 90 days at most.',
    creativeMismatch: "The creative doesn't match the placement.",
    credit: (limit: string, excess: string) =>
      `Over your credit limit of ${limit} by ${excess}. Pay an open invoice or ask Global to raise it.`,
    terms: 'Confirm the offer is genuine.',
  },
  previewBox: {
    title: 'Card preview',
    subtitle: 'What the Phoenix user sees.',
    headline: 'Your headline',
    brand: 'Brand',
    code: 'Claim code in store',
    link: 'Link to your site',
  },
  cost: {
    title: 'Cost',
    impressions: 'Estimated impressions',
    perDay: (perDay: string, days: number, opens: string) => `about ${perDay} a day for ${days} days · ~${opens} opens`,
    placementCountry: (placement: string, country: string) => `${placement} · ${country}`,
    cpm: (dollars: string) => `$${dollars} per 1,000`,
    rewards: (shares: string, symbol: string, reward: number) => `Share rewards (est. ${shares} × ${symbol}${reward})`,
    cap: 'Rewards cap',
    capValue: '20% of budget',
    budget: 'Budget',
    creditAfter: 'Credit after',
    left: (amount: string) => `${amount} left`,
  },
  buttons: {
    submit: 'Submit for review',
    preview: 'See it on Phoenix',
    saveResubmit: 'Save and resubmit',
    cancel: 'Cancel',
    // Ours: the New form's way to drop its draft (spec §6.3).
    startOver: 'Start over',
  },
  toasts: {
    submitted: 'Submitted — Global reviews within one working day',
    resubmitted: 'Resubmitted — Global reviews within one working day',
  },

  // Edit offer on a live, scheduled or paused campaign: the revision carries the offer only (spec §6.14.3).
  locked: {
    terms: 'Change these without review on the campaign page.',
    running: '— fixed while the campaign runs',
  },
  upload: {
    uploading: 'Uploading…',
    videoLength: 'Video must be 6–15 seconds.',
    tooLarge: 'That file is over 2 MB.',
    bad: "That file can't be used. Attach a JPG, PNG or WebP image, or an MP4 video.",
    failed: "The upload didn't finish. Try again.",
  },
  // What the server answers when submitting or saving fails after the form's own rules passed.
  errors: {
    noRate: (country: string) => `No rate is set for this placement in ${country} yet. Ask Global.`,
    noFx: (country: string) => `No exchange rate is set for ${country} yet. Ask Global.`,
    flightEnded: 'The flight has already ended. Pick new dates.',
    notFound: "That campaign isn't in this workspace, so nothing was changed.",
    invalidTransition: "That campaign can't change state right now.",
    workspaceDeclined: "Your workspace was declined, so campaigns can't be submitted.",
  },
  // A field the schema refuses that no ADV §3 rule names.
  invalid: {
    name: 'Give the campaign a name of 2 to 80 characters.',
    brand: 'Keep the brand to 80 characters.',
    budgetUsd: 'Budget is in whole dollars.',
    rewardLocal: 'Share reward is a whole number, 0 or more.',
    startsAt: 'Pick a start date.',
    endsAt: 'Pick an end date.',
    other: "This campaign can't be submitted until every field is filled in correctly.",
  },
} as const
