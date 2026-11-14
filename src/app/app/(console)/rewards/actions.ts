'use server'

import { revalidatePath } from 'next/cache'
import { REWARDS } from '@/lib/copy-rewards'
import { requireMember } from '@/lib/permissions'
import { saveCaps, setCampaignReward, validCaps } from '@/lib/rewards-settings'

type Result = { ok: true } | { error: string }

export async function setRewardAction(campaignId: unknown, rewardLocal: unknown): Promise<Result> {
  const { user, workspace, role } = await requireMember('rewards')
  if (typeof campaignId !== 'string' || typeof rewardLocal !== 'number' || !Number.isInteger(rewardLocal) || rewardLocal < 0) {
    return { error: REWARDS.invalid }
  }
  try {
    await setCampaignReward(workspace.id, user.id, campaignId, rewardLocal, role === 'Global')
  } catch (e) {
    return { error: typeof e === 'string' ? e : REWARDS.invalid }
  }
  revalidatePath('/app/rewards')
  revalidatePath('/app')
  return { ok: true }
}

export async function saveCapsAction(input: { maxPerSharerPerDay: unknown; capPct: unknown; pointsPerShare: unknown }): Promise<Result> {
  const { user, workspace } = await requireMember('rewards')
  const caps = { maxPerSharerPerDay: input?.maxPerSharerPerDay, capPct: input?.capPct, pointsPerShare: input?.pointsPerShare }
  if (!validCaps(caps as never)) return { error: REWARDS.invalid }
  await saveCaps(workspace.id, user.id, caps as never)
  revalidatePath('/app/rewards')
  return { ok: true }
}
