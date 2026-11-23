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
    headline: { label: 'Offer headline', counter: (n: number, max: number) => `— ${n}/${max}`, placeholder: 'Buy 2 bottles, get 1 free' },
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
  // The zone hints are ours: the prototype's "tap to attach a sample (demo)" was a demo's; this is a real upload.
  drop: {
    card: {
      label: 'Ad image', hint: '— optional. Square or landscape works best.',
      zoneTitle: 'Upload image', zoneHint: 'drag a JPG, PNG or WebP here, or choose a file',
    },
    featured: {
      label: 'Ad image', hint: '— optional. Square or landscape works best.',
      zoneTitle: 'Upload image', zoneHint: 'drag a JPG, PNG or WebP here, or choose a file',
    },
    // The size in these two hints is ours: the caps by kind (image-rules) replaced the prototype's "under 2 MB".
    video: {
      label: 'Video clip', hint: '— MP4, 6–15 s, under 25 MB. Required.',
      zoneTitle: 'Upload creative', zoneHint: 'drag an MP4 here, or choose a file',
    },
    splash: {
      label: 'Splash creative', hint: '— portrait image under 4 MB, or an MP4 under 25 MB. Required.',
      zoneTitle: 'Upload creative', zoneHint: 'drag an image or an MP4 here, or choose a file',
    },
    attached: 'Tap to remove',
    // Ours: a chosen splash shows in a small phone; this opens the Phoenix preview with it full screen.
    viewFull: 'View full size',
    splashFrame: 'Your splash on a phone',
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
    // Ours: the server's backstop for the caps by kind (a 3 MB splash image sent on a card past the form).
    creativeTooLarge: 'The creative is too large for this placement.',
    // Ours: the server's backstop for the file itself (a draft naming a file deleted since, a key crafted past the form).
    creativeMissing: "The creative's file is no longer stored. Attach it again.",
    credit: (limit: string, excess: string) =>
      `Over your credit limit of ${limit} by ${excess}. Pay an open invoice or ask Global to raise it.`,
    terms: 'Confirm the offer is genuine.',
    // Ours: past the largest reward a campaign can store (MAX_REWARD_LOCAL). The campaign page's Change without
    // review and the Rewards page say the same.
    rewardTooLarge: 'That reward is too large.',
    // Ours: an https link Phoenix users could not open ("https://" alone, a space in the address).
    linkInvalid: "Phoenix users can't open that link. Check the address, like https://yourbrand.com/offer.",
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
    // Ours (Prompt 6): the New form's step to its Review, the way back, and keeping the draft for later.
    review: 'Review before submitting',
    back: 'Back to edit',
    saveDraft: 'Save draft',
  },
  // Ours (Prompt 9): beside "Save draft" while the New form holds a draft. The draft never reaches the server (Prompt 6
  // ruling), so the form says where it is.
  savedHere: 'Saved in this browser',
  toasts: {
    submitted: 'Submitted — Global reviews within one working day',
    resubmitted: 'Resubmitted — Global reviews within one working day',
    // Ours (Prompt 6; Prompt 9 says where).
    draftSaved: 'Draft saved in this browser — open it from Campaigns home to carry on',
  },

  // Ours (Prompt 6): a campaign is one offer on one market, said once over the New form.
  oneOffer: 'One offer per campaign. Add another campaign for another offer.',
  // Ours (Prompt 6): the New form's Review step, a read-only summary before Submit. Its labels are the fields'.
  review: {
    title: 'Review your campaign',
    sub: 'Nothing goes to Global until you submit. Go back to change anything.',
    offer: 'The offer',
    creative: 'Creative',
    targeting: 'Targeting',
    money: 'Money',
    image: 'The image you attached',
    video: 'The video you attached',
    noCreative: 'No image. The card shows your tile colour and initials.',
    placementAt: (placement: string, cpm: string) => `${placement} · ${cpm}`,
    age: 'Age gate',
    ageGated: '18+ on the card',
    open: 'None',
    licence: 'Licence or approval number',
    licenceFound: 'In the description ✓',
    flight: 'Flight',
    flightValue: (start: string, end: string, days: number) => `${start} – ${end} · ${days} ${days === 1 ? 'day' : 'days'}`,
    reward: (amount: string) => `${amount} airtime per successful share`,
    // Ours: each value's way back to its field on the edit step (the confirmation is asked for again).
    edit: 'Edit',
    editLabel: (field: string) => `Edit ${field}`,
  },

  // Edit offer on a live, scheduled or paused campaign: the revision carries the offer only (spec §6.14.3).
  locked: {
    terms: 'Change these without review on the campaign page.',
    running: '— fixed while the campaign runs',
  },
  // The creative picker: refused in the browser before sending (type for the placement, size for the kind), then
  // what the server answered, and why a placement switch took the creative off.
  upload: {
    uploading: 'Uploading…',
    videoLength: 'Video must be 6–15 seconds.',
    tooLarge: (size: string, limit: string) => `That file is ${size}; the limit is ${limit}.`,
    overLimit: (limit: string) => `That file is over the ${limit} limit.`,
    wrongImage: (type: string) => `That file is ${type}. Use a JPG, PNG or WebP.`,
    wrongVideo: 'MP4 only for video.',
    wrongSplash: (type: string) => `That file is ${type}. Use a JPG, PNG or WebP image, or an MP4 video.`,
    bad: "That file can't be used. Attach a JPG, PNG or WebP image, or an MP4 video.",
    failed: "The upload didn't finish. Try again.",
    // Said once when an upload lands, after "Uploading…".
    attached: { image: 'Image attached.', video: 'Video attached.' },
    cleared: {
      video: (placement: string) => `The video was removed — a ${placement} shows an image.`,
      image: 'The image was removed — Video needs an MP4.',
      tooLarge: (placement: string, limit: string) => `The image was removed — a ${placement} takes images up to ${limit}.`,
    },
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
  // A field's own shape (its length, whole numbers, a real date), judged in that field's place among the ADV §3 rules;
  // `other` is for what only a request crafted past the form can send (a market or colour the form never offers).
  invalid: {
    name: (min: number, max: number) => `Give the campaign a name of ${min} to ${max} characters.`,
    brand: (max: number) => `Keep the brand to ${max} characters.`,
    headline: (max: number) => `Keep the headline to ${max} characters.`,
    description: (max: number) => `Keep the description to ${max} characters.`,
    budgetUsd: 'Budget is in whole dollars.',
    rewardLocal: 'Share reward is a whole number, 0 or more.',
    startsAt: 'Pick a start date.',
    endsAt: 'Pick an end date.',
    other: "This campaign can't be submitted until every field is filled in correctly.",
  },
} as const
