import { CAMPAIGN_FORM_COPY } from '@/lib/copy-campaign-form'

// The Rewards page's words (ADV §6), verbatim; rewardTooLarge is ours (the campaign form's sentence).
export const REWARDS = {
  crumb: 'Rewards',
  growth: 'Growth',
  title: 'Rewards',
  lead: 'What a successful share earns, per campaign, and the caps that stop it being gamed.',
  // The head's primary: a reward is set when a campaign is made.
  newCampaign: 'New campaign',
  perCampaign: {
    title: 'Per campaign',
    sub: "Airtime per successful share, in your campaign's currency. Deducted from the campaign budget as rewards are earned.",
    head: ['Campaign', 'Country', 'Airtime per share', 'Paid so far', 'Cap'],
    toast: 'Reward updated — applies to new shares',
  },
  caps: {
    title: 'Caps',
    sub: 'Stop one person farming rewards.',
    maxPerDay: 'Max successful shares per sharer per day',
    capPct: 'Max rewards as % of campaign budget',
    points: 'Points per successful share',
    save: 'Save',
    toast: 'Caps saved',
  },
  delivery: {
    title: 'Delivery',
    text: 'Airtime and data are sent by Reloadly within minutes of a successful share. Global tops up the aggregator and recharges you through your invoice.',
  },
  invalid: 'Enter a whole number in range.',
  rewardTooLarge: CAMPAIGN_FORM_COPY.validation.rewardTooLarge,
} as const
