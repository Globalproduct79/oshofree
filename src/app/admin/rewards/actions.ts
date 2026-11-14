'use server'

import { revalidatePath } from 'next/cache'
import { REWARDS_LEDGER as R } from '@/lib/copy-rewards-ledger'
import { setFraudRule } from '@/lib/fraud'
import { rejectPayout, releasePayout, topUpAggregator } from '@/lib/rewards'
import { requireAdmin } from '@/lib/session'

type Result = { toast: string } | { error: string }
const PATH = '/admin/rewards'

export async function topUpAction(dollars: unknown): Promise<Result> {
  const admin = await requireAdmin()
  if (typeof dollars !== 'number' || !Number.isInteger(dollars) || dollars <= 0) return { error: R.invalidAmount }
  try {
    await topUpAggregator(dollars * 100, admin.id)
  } catch (e) {
    if (e === 'INVALID') return { error: R.invalidAmount }
    throw e
  }
  revalidatePath(PATH)
  return { toast: R.topUpToast }
}

export async function setFraudRuleAction(key: unknown, enabled: unknown): Promise<Result> {
  const admin = await requireAdmin()
  if (typeof key !== 'string' || typeof enabled !== 'boolean') return { error: R.notFound }
  try {
    await setFraudRule(key, enabled, admin.id)
  } catch (e) {
    if (e === 'INVALID') return { error: R.notFound }
    throw e
  }
  revalidatePath(PATH)
  return { toast: enabled ? R.ruleOn : R.ruleOff }
}

export async function releasePayoutAction(id: unknown): Promise<Result> {
  const admin = await requireAdmin()
  if (typeof id !== 'string') return { error: R.notFound }
  try {
    await releasePayout(id, admin.id, new Date(), { strict: true })
  } catch (e) {
    if (e === 'CAP') return { error: R.overCap }
    if (e === 'NOT_HELD') return { error: R.alreadyHandled }
    if (e === 'NOT_FOUND') return { error: R.notFound }
    throw e
  }
  revalidatePath(PATH)
  return { toast: R.released }
}

export async function rejectPayoutAction(id: unknown): Promise<Result> {
  const admin = await requireAdmin()
  if (typeof id !== 'string') return { error: R.notFound }
  try {
    await rejectPayout(id, admin.id, { strict: true })
  } catch (e) {
    if (e === 'NOT_HELD') return { error: R.alreadyHandled }
    if (e === 'NOT_FOUND') return { error: R.notFound }
    throw e
  }
  revalidatePath(PATH)
  return { toast: R.rejected }
}
