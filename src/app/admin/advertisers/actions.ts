'use server'

import { revalidatePath } from 'next/cache'
import { creditLimitInput } from '@/lib/advertisers'
import { audit } from '@/lib/audit'
import { ADVERTISERS as A } from '@/lib/copy-advertisers'
import { db } from '@/lib/db'
import { closeMonth, monthToClose, setCreditLimit } from '@/lib/money'
import { requireAdmin } from '@/lib/session'

// Platform › Advertisers (GLB §2.2, spec §6.5). Each answers with the toast to show: what was done, or why
// nothing was (a refusal is a toast, not an error page).
export type AdvertiserResult = { toast: string } | { error: string }

// The credit-limit field (here and on the workspace page): whole dollars from 0 up to what the column holds,
// unlike the prototype (D9). The owner is told and the change audited by setCreditLimit; both pages redraw with
// the new limit (D10).
export async function setCreditLimitAction(id: unknown, dollars: unknown): Promise<AdvertiserResult> {
  const admin = await requireAdmin()
  const limit = creditLimitInput(dollars)
  if ('error' in limit) return limit
  const ws = typeof id === 'string' ? await db.workspace.findUnique({ where: { id }, select: { id: true } }) : null
  if (!ws) return { error: A.errors.noWorkspace }
  await setCreditLimit(ws.id, limit.cents, admin.id)
  revalidatePath('/admin/advertisers', 'layout')
  return { toast: A.creditToast }
}

const CLOSE_REFUSALS: Record<string, string> = { MONTH_NOT_OVER: A.notOver, NO_FX: A.noFx }

// "Close month" (header action): issues last month's invoices, as the daily job does on the 1st. Closing a month
// already closed issues nothing.
export async function closeMonthAction(): Promise<AdvertiserResult> {
  const admin = await requireAdmin()
  const now = new Date()
  const period = monthToClose(now)
  let issued: number
  try {
    issued = (await closeMonth(period, admin.id, now)).invoices.length
  } catch (e) {
    if (typeof e === 'string' && Object.hasOwn(CLOSE_REFUSALS, e)) return { error: CLOSE_REFUSALS[e] }
    throw e
  }
  await audit(admin.id, 'month.close', { type: 'Month', id: period.toISOString().slice(0, 7) }, undefined, { invoices: issued })
  revalidatePath('/', 'layout')
  return { toast: A.closed(issued) }
}
