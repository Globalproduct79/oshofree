import type { Campaign, CampaignStatus, Prisma } from '@prisma/client'
import { db, type Tx } from '@/lib/db'
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
  client: Tx = db,
): Promise<Campaign> {
  const { count } = await client.campaign.updateMany({ where: { id, status: { in: from } }, data })
  if (count === 0) throw 'INVALID_TRANSITION'
  return client.campaign.findUniqueOrThrow({ where: { id } })
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

// Reasons are required for a "no". Status, mints and the audit row commit together or not at all.
export async function approveCampaign(id: string, byUserId: string): Promise<Campaign> {
  const row = await db.campaign.findUnique({ where: { id }, select: { workspace: { select: { status: true } } } })
  if (row && row.workspace.status !== 'approved') throw 'WORKSPACE_NOT_APPROVED'
  return db.$transaction(async (tx) => {
    const live = await move(id, ['review'], { status: 'live', decidedAt: new Date(), rejectReason: null }, tx)
    const channels = await tx.channel.findMany({ where: { isLive: true }, select: { id: true } })
    for (const ch of channels) await mintRootLink(id, ch.id, tx)
    await tx.reviewAction.create({ data: { targetType: 'Campaign', targetId: id, action: 'Approve', byUserId } })
    return live
  })
}

export async function rejectCampaign(id: string, byUserId: string, reason: string): Promise<Campaign> {
  const why = reason.trim()
  if (!why) throw 'REASON_REQUIRED'
  return db.$transaction(async (tx) => {
    const rejected = await move(id, ['review'], { status: 'rejected', rejectReason: why, decidedAt: new Date() }, tx)
    await tx.reviewAction.create({
      data: { targetType: 'Campaign', targetId: id, action: 'Reject', reason: why, byUserId },
    })
    return rejected
  })
}
