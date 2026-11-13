import { z } from 'zod'
import type { Campaign, CampaignStatus } from '@prisma/client'
import { db } from '@/lib/db'
import { CATEGORIES, COUNTRIES } from '@/lib/markets'
import { tokens } from '@/lib/tokens'

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

function fields(i: CampaignInput) {
  const startsAt = new Date(`${i.startsAt}T00:00:00.000Z`)
  const endsAt = new Date(startsAt.getTime() + i.runsForDays * 86_400_000)
  return {
    name: i.name,
    brand: i.brand,
    country: i.country,
    category: i.category,
    headline: i.headline,
    description: i.description,
    tileColor: i.tileColor ?? null,
    creativeImageKey: i.creativeImageKey ?? null,
    placement: i.placement,
    redeemMethod: i.redeemMethod,
    claimCode: i.claimCode ?? null,
    linkUrl: i.linkUrl ?? null,
    budgetUsd: i.budgetUsd,
    startsAt,
    endsAt,
    shareRewardLabel: i.shareRewardLabel,
  }
}

async function statusOf(id: string): Promise<CampaignStatus> {
  const c = await db.campaign.findUniqueOrThrow({ where: { id }, select: { status: true } })
  return c.status
}

async function move(
  id: string,
  from: CampaignStatus[],
  data: Parameters<typeof db.campaign.update>[0]['data'],
): Promise<Campaign> {
  if (!from.includes(await statusOf(id))) throw 'INVALID_TRANSITION'
  return db.campaign.update({ where: { id }, data })
}

export function createCampaign(workspaceId: string, i: CampaignInput): Promise<Campaign> {
  return db.campaign.create({ data: { workspaceId, status: 'draft', ...fields(i) } })
}

export function updateCampaign(id: string, i: CampaignInput): Promise<Campaign> {
  return move(id, ['draft', 'rejected'], fields(i))
}

export function submitCampaign(id: string): Promise<Campaign> {
  return move(id, ['draft', 'rejected'], {
    status: 'review',
    submittedAt: new Date(),
    rejectReason: null,
  })
}

export function pauseCampaign(id: string): Promise<Campaign> {
  return move(id, ['live'], { status: 'paused' })
}

export function resumeCampaign(id: string): Promise<Campaign> {
  return move(id, ['paused'], { status: 'live' })
}
