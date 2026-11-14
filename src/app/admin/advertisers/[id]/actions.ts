'use server'

import { revalidatePath } from 'next/cache'
import type { AdvertiserResult } from '@/app/admin/advertisers/actions'
import { creditLimitInput } from '@/lib/advertisers'
import { audit } from '@/lib/audit'
import { ADVERTISERS } from '@/lib/copy-advertisers'
import { db } from '@/lib/db'
import { isCountry } from '@/lib/markets'
import { decideCredit, markInvoicePaid } from '@/lib/money'
import { requireAdmin } from '@/lib/session'
import { approveWorkspace, declineWorkspace, reapproveWorkspace, updateWorkspace, type WorkspaceUpdate } from '@/lib/workspaces'

// Platform › Advertisers › workspace (spec §6.1, §6.5, §6.14.6): everything here is Global's, audited, and
// answers with the toast to show.

const A = ADVERTISERS
const D = ADVERTISERS.detail
const E = ADVERTISERS.errors

const textOf = (v: unknown) => (typeof v === 'string' ? v : '')

const REFUSALS: Record<string, string> = {
  INVALID_TRANSITION: E.alreadyDecided,
  REASON_REQUIRED: E.reasonRequired,
  NOT_FOUND: E.noWorkspace,
}

// Global only. A decision moves the Review badge, the switcher and the workspace's banner, so every layout redraws.
async function decide(run: (adminId: string) => Promise<string>): Promise<AdvertiserResult> {
  const admin = await requireAdmin()
  let toast: string
  try {
    toast = await run(admin.id)
  } catch (e) {
    if (typeof e === 'string' && Object.hasOwn(REFUSALS, e)) return { error: REFUSALS[e] }
    throw e
  }
  revalidatePath('/', 'layout')
  return { toast }
}

export async function approveAction(id: unknown): Promise<AdvertiserResult> {
  return decide(async (by) => D.approved((await approveWorkspace(textOf(id), by)).name))
}

export async function declineAction(id: unknown, reason: unknown): Promise<AdvertiserResult> {
  return decide(async (by) => D.declined((await declineWorkspace(textOf(id), by, textOf(reason))).name))
}

export async function reapproveAction(id: unknown): Promise<AdvertiserResult> {
  return decide(async (by) => D.approved((await reapproveWorkspace(textOf(id), by)).name))
}

// ---- Facts: the settings an owner cannot change once approved, and Global's own fields ----

type Fact = 'type' | 'country' | 'registrationNumber' | 'accountManager'

// Each field's check: the value to store, or the refusal.
const FACTS: Record<Fact, (v: string) => { value: string | null } | { error: string }> = {
  type: (v) => (v === 'Brand' || v === 'Agency' ? { value: v } : { error: E.type }),
  country: (v) => (isCountry(v) ? { value: v } : { error: E.country }),
  registrationNumber: (v) => (v.trim().length <= 40 ? { value: v.trim() || null } : { error: E.registration }),
  accountManager: (v) => {
    const name = v.trim()
    return name && name.length <= 60 ? { value: name } : { error: E.manager }
  },
}

const isFact = (v: unknown): v is Fact => typeof v === 'string' && Object.hasOwn(FACTS, v)

// Type and billing country stay Global's after approval (spec §6.14.6); a country change applies from the next
// invoice, since an issued invoice keeps its own rate.
export async function updateFactAction(id: unknown, field: unknown, value: unknown): Promise<AdvertiserResult> {
  const admin = await requireAdmin()
  if (!isFact(field)) return { error: E.field }
  const checked = FACTS[field](textOf(value))
  if ('error' in checked) return checked
  const ws = typeof id === 'string' ? await db.workspace.findUnique({ where: { id } }) : null
  if (!ws) return { error: E.noWorkspace }
  const before = ws[field]
  if (before !== checked.value) {
    await updateWorkspace(ws.id, { [field]: checked.value } as WorkspaceUpdate)
    await audit(admin.id, 'workspace.update', { type: 'Workspace', id: ws.id, workspaceId: ws.id },
      { [field]: before }, { [field]: checked.value })
    revalidatePath('/admin/advertisers', 'layout')
  }
  return { toast: D.factToast[field] }
}

// ---- Money ----

// "Mark paid" moved here from the advertiser's Invoices page (spec §6.5). Paying a paid invoice changes nothing.
export async function markInvoicePaidAction(id: unknown): Promise<AdvertiserResult> {
  const admin = await requireAdmin()
  const inv = typeof id === 'string' ? await db.invoice.findUnique({ where: { id }, select: { id: true } }) : null
  if (!inv) return { error: E.noInvoice }
  const paid = await markInvoicePaid(inv.id, admin.id, new Date())
  revalidatePath('/admin/advertisers', 'layout')
  return { toast: D.paid(paid.number) }
}

// A "Request a higher limit": Approve sets the limit typed beside it (and tells the owner); Dismiss leaves it.
export async function decideCreditAction(id: unknown, decision: unknown, dollars?: unknown): Promise<AdvertiserResult> {
  const admin = await requireAdmin()
  const request = typeof id === 'string' ? await db.creditRequest.findUnique({ where: { id } }) : null
  if (!request || request.status !== 'open' || (decision !== 'approved' && decision !== 'dismissed')) {
    return { error: E.alreadyDecided }
  }
  const limit = decision === 'approved' ? creditLimitInput(dollars) : null
  if (limit && 'error' in limit) return limit
  const decided = await decideCredit(request.id, admin.id, decision, limit?.cents)
  if (decided.decidedById !== admin.id || decided.status !== decision) return { error: E.alreadyDecided }
  revalidatePath('/admin/advertisers', 'layout')
  return { toast: decision === 'approved' ? A.creditToast : D.dismissed }
}
