import type { Campaign, CampaignStatus, Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { mintRootLink } from '@/lib/links'
import { campaignDates, type CampaignInput } from '@/lib/campaign-schema'

export { campaignInput, validateCampaign, type CampaignInput } from '@/lib/campaign-schema'

function fields(i: CampaignInput) {
  const { startsAt, endsAt } = campaignDates(i.startsAt, i.runsForDays)
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
    linkUrl: i.linkUrl?.trim() || null,
    budgetUsd: i.budgetUsd,
    startsAt,
    endsAt,
    shareRewardLabel: i.shareRewardLabel,
  }
}

async function move(
  id: string,
  from: CampaignStatus[],
  data: Prisma.CampaignUncheckedUpdateManyInput,
): Promise<Campaign> {
  const { count } = await db.campaign.updateMany({ where: { id, status: { in: from } }, data })
  if (count === 0) throw 'INVALID_TRANSITION'
  return db.campaign.findUniqueOrThrow({ where: { id } })
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

// Reasons are required for a "no"; the decision is recorded with the person who made it.
export async function approveCampaign(id: string, byUserId: string): Promise<Campaign> {
  const row = await db.campaign.findUnique({ where: { id }, select: { workspace: { select: { status: true } } } })
  if (row && row.workspace.status !== 'approved') throw 'WORKSPACE_NOT_APPROVED'
  const live = await move(id, ['review'], { status: 'live', decidedAt: new Date(), rejectReason: null })
  const channels = await db.channel.findMany({ where: { isLive: true }, select: { id: true } })
  for (const ch of channels) await mintRootLink(id, ch.id)
  await db.reviewAction.create({ data: { targetType: 'Campaign', targetId: id, action: 'Approve', byUserId } })
  return live
}

export async function rejectCampaign(id: string, byUserId: string, reason: string): Promise<Campaign> {
  const why = reason.trim()
  if (!why) throw 'REASON_REQUIRED'
  const rejected = await move(id, ['review'], { status: 'rejected', rejectReason: why, decidedAt: new Date() })
  await db.reviewAction.create({
    data: { targetType: 'Campaign', targetId: id, action: 'Reject', reason: why, byUserId },
  })
  return rejected
}
