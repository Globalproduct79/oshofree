import 'server-only'
import { audit } from '@/lib/audit'
import { changeWithoutReview } from '@/lib/campaigns'
import { db } from '@/lib/db'

export type Caps = { maxPerSharerPerDay: number; capPct: number; pointsPerShare: number }

const int = (v: unknown, min: number, max = Infinity): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max

export function validCaps(c: Caps): boolean {
  return int(c.maxPerSharerPerDay, 1) && int(c.capPct, 1, 100) && int(c.pointsPerShare, 0)
}

// The workspace's three caps; every campaign above the new percentage comes down to it (spec §6.14.4).
// "Global's more than 5 per sharer per day" fraud rule stays the platform floor, applied elsewhere.
export async function saveCaps(workspaceId: string, byUserId: string, caps: Caps): Promise<void> {
  if (!validCaps(caps)) throw 'INVALID'
  await db.$transaction(async (tx) => {
    const before = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId } })
    await tx.workspace.update({
      where: { id: workspaceId },
      data: { rewardMaxPerSharerPerDay: caps.maxPerSharerPerDay, rewardCapPct: caps.capPct, pointsPerShare: caps.pointsPerShare },
    })
    await tx.campaign.updateMany({ where: { workspaceId, rewardCapPct: { gt: caps.capPct } }, data: { rewardCapPct: caps.capPct } })
    await tx.auditEvent.create({
      data: {
        actorId: byUserId, action: 'rewards.caps', targetType: 'Workspace', targetId: workspaceId, workspaceId,
        before: { maxPerSharerPerDay: before.rewardMaxPerSharerPerDay, capPct: before.rewardCapPct, pointsPerShare: before.pointsPerShare },
        after: { ...caps },
      },
    })
  })
}

// One campaign's airtime per share; the campaign must belong to the workspace.
export async function setCampaignReward(
  workspaceId: string, byUserId: string, campaignId: string, rewardLocal: number, isGlobal: boolean, now = new Date(),
): Promise<void> {
  if (!int(rewardLocal, 0)) throw 'INVALID'
  const c = await db.campaign.findFirst({ where: { id: campaignId, workspaceId } })
  if (!c) throw 'NOT_FOUND'
  await changeWithoutReview(campaignId, byUserId, { rewardLocal }, now)
  if (isGlobal) {
    await audit(byUserId, 'rewards.reward', { type: 'Campaign', id: campaignId, workspaceId }, { rewardLocal: c.rewardLocal }, { rewardLocal })
  }
}
