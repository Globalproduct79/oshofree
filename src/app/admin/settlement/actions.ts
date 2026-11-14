'use server'

import { revalidatePath } from 'next/cache'
import { SETTLEMENT } from '@/lib/copy-settlement'
import { db } from '@/lib/db'
import { markStatementPaid } from '@/lib/money'
import { setShare } from '@/lib/rates'
import { requireAdmin } from '@/lib/session'

type Result = { toast: string } | { error: string }

export async function setShareAction(value: unknown): Promise<Result> {
  const admin = await requireAdmin()
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) return { error: SETTLEMENT.invalidShare }
  const channel = await db.channel.findUnique({ where: { key: 'phoenix' } })
  if (!channel) return { error: SETTLEMENT.invalidShare }
  try {
    await setShare(channel.id, value, admin.id)
  } catch (e) {
    if (e === 'INVALID') return { error: SETTLEMENT.invalidShare }
    throw e
  }
  revalidatePath('/admin/settlement')
  return { toast: SETTLEMENT.shareToast }
}

export async function markStatementPaidAction(id: unknown): Promise<Result> {
  const admin = await requireAdmin()
  if (typeof id !== 'string') return { error: SETTLEMENT.paidToast }
  try {
    await markStatementPaid(id, admin.id)
  } catch (e) {
    if (e === 'NOT_FOUND') return { error: 'Statement not found.' }
    throw e
  }
  revalidatePath('/admin/settlement')
  return { toast: SETTLEMENT.paidToast }
}
