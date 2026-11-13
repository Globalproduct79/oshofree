import { z } from 'zod'
import { CATEGORIES, COUNTRIES } from '@/lib/markets'
import { tokens } from '@/lib/tokens'

// No database here: the campaign form imports this in the browser.

export const campaignInput = z.object({
  name: z.string().trim().min(2).max(80),
  brand: z.string().trim().min(1).max(80),
  country: z.enum(COUNTRIES),
  category: z.enum(CATEGORIES),
  headline: z.string().trim().max(48),
  description: z.string().trim().max(240),
  tileColor: z.string().refine((c) => (tokens.tileColors as readonly string[]).includes(c)).optional(),
  creativeImageKey: z.string().optional(),
  placement: z.literal('card'),
  redeemMethod: z.enum(['code', 'link']),
  claimCode: z.string().trim().min(1).max(24).optional(),
  linkUrl: z.string().trim().optional(),
  budgetUsd: z.number().int().min(50),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  runsForDays: z.number().int().min(1).max(90),
  shareRewardLabel: z.string().trim().min(1).max(60),
  termsAccepted: z.literal(true),
})
export type CampaignInput = z.infer<typeof campaignInput>

const LICENCE = /licen|approv|NLRC|BCLB|LONASE|GBT/i
const DRAW = /draw|jackpot/i

function needsLicence(i: CampaignInput) {
  return (i.category === 'Betting' || DRAW.test(i.headline)) && !LICENCE.test(i.description)
}

export function validateCampaign(i: CampaignInput): string | null {
  if (!i.name.trim()) return 'Give the campaign a name.'
  if (!i.brand.trim()) return 'Which brand is this for?'
  if (!i.headline.trim()) return 'Write the offer headline.'
  if (!i.description.trim()) return 'Describe what the consumer gets.'
  if (needsLicence(i))
    return 'Betting and draw offers need a licence or approval number in the description.'
  if (i.redeemMethod === 'link' && !i.linkUrl?.trim().startsWith('https://'))
    return 'Online offers need an https:// link.'
  if (i.redeemMethod === 'code' && !i.claimCode?.trim())
    return 'Add the claim code consumers will show.'
  if (i.budgetUsd < 50) return 'Minimum budget is $50.'
  if (i.termsAccepted !== true) return 'Confirm the offer is genuine.'
  return null
}

// A campaign starts at midnight UTC on its start date and ends runsForDays later.
export function campaignDates(startsAt: string, runsForDays: number) {
  const start = new Date(`${startsAt}T00:00:00.000Z`)
  return { startsAt: start, endsAt: new Date(start.getTime() + runsForDays * 86_400_000) }
}
