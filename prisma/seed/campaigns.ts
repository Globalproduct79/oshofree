import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { approveCampaign } from '@/lib/campaigns'
import { tokens } from '@/lib/tokens'

const DAY = 24 * 60 * 60 * 1000
const midnight = (now: Date, offsetDays: number) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + offsetDays * DAY)

type Spec = Pick<Prisma.CampaignUncheckedCreateInput, 'name' | 'headline' | 'description' | 'budgetUsd' | 'shareRewardLabel' | 'redeemMethod'> &
  Partial<Prisma.CampaignUncheckedCreateInput> & { startOffset: number; days: number }

const SHARE = 'Share with 10 friends, get ₦50 airtime'

export async function seedCampaigns(workspaceId: string, adminId: string, now: Date) {
  const specs: Spec[] = [
    { name: 'Buy 2 get 1', headline: 'Buy 2 Kola Bright, get 1 free',
      description: 'Show the code at any Kola Bright stand in Lagos. One free bottle per customer, while stock lasts.',
      redeemMethod: 'code', claimCode: 'KOLA2X1', budgetUsd: 200, shareRewardLabel: SHARE, startOffset: -7, days: 21, tileColor: tokens.tileColors[0] },
    { name: 'Weekend cashback', headline: 'Weekend cashback on Kola Bright',
      description: 'Spend over ₦2,000 at Kola Bright this weekend and get cashback.',
      redeemMethod: 'link', linkUrl: 'https://kolabright.ng/weekend', budgetUsd: 150, shareRewardLabel: SHARE, startOffset: 1, days: 10, tileColor: tokens.tileColors[1] },
    { name: 'December draw teaser', headline: 'December draw: win a year of Kola Bright',
      description: 'Enter the December draw for a year of Kola Bright. Licence NLRC/2026/0142. 18+ only.',
      redeemMethod: 'code', claimCode: 'DRAW12', budgetUsd: 300, shareRewardLabel: SHARE, startOffset: 10, days: 14, tileColor: tokens.tileColors[3] },
    { name: 'August multipack', headline: 'Six Kola Bright for the price of five',
      description: 'Show the code at any Kola Bright stand. The August multipack deal.',
      redeemMethod: 'code', claimCode: 'AUG6', budgetUsd: 120, shareRewardLabel: SHARE, startOffset: -35, days: 14, tileColor: tokens.tileColors[4] },
  ]
  const made = []
  for (const { startOffset, days, ...s } of specs) {
    const startsAt = midnight(now, startOffset)
    const submittedAt = s.name === 'Weekend cashback' ? new Date(now.getTime() - 2 * DAY) : new Date(startsAt.getTime() - 3 * DAY)
    const c = await db.campaign.create({
      data: { workspaceId, brand: 'Kola Bright', country: 'NG', category: 'Food & drink', placement: 'card',
        status: 'review', submittedAt, startsAt, endsAt: new Date(startsAt.getTime() + days * DAY), ...s },
    })
    if (s.name === 'Weekend cashback') { made.push(c); continue }
    // A flight already over was approved as it started and ended as the daily job would have ended it.
    const over = c.endsAt <= now
    const approved = await approveCampaign(c.id, adminId, over ? c.startsAt : now)
    made.push(over
      ? await db.campaign.update({ where: { id: c.id }, data: { status: 'ended', endedAt: approved.endsAt } })
      : approved)
  }
  return { buy2: made[0], weekend: made[1], draw: made[2], august: made[3] }
}
