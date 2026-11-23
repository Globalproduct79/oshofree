import type { Campaign, Prisma } from '@prisma/client'
import { deliveringWhere } from '@/lib/campaign-status'
import { db } from '@/lib/db'
import { spendByCampaign } from '@/lib/money'

export type Delivering = { campaign: Campaign; leftCents: number }

// What Phoenix may list, claim and share now: a delivering campaign (campaign-status: live, approved workspace, flight
// running) with budget left. A reward is charged the moment a friend claims, so a campaign can spend its last cent
// mid-day; from then on it is not delivering, as a paused or ended one is not, even before the daily job's run ends it.
// One read for the campaigns and one grouped read for their spend, whatever the filter.
export async function deliveringWithBudget(where: Prisma.CampaignWhereInput, now: Date): Promise<Delivering[]> {
  const campaigns = await db.campaign.findMany({ where: { ...where, ...deliveringWhere(now) } })
  const spent = await spendByCampaign(campaigns.map((c) => c.id))
  return campaigns
    .map((campaign) => ({ campaign, leftCents: campaign.budgetUsd * 100 - (spent.get(campaign.id) ?? 0) }))
    .filter((d) => d.leftCents > 0)
}

// The one offer, when it is delivering with budget left.
export async function isDeliveringNow(offerId: string, now: Date): Promise<boolean> {
  return (await deliveringWithBudget({ id: offerId }, now)).length > 0
}
