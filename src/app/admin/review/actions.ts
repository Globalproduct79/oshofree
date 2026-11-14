'use server'

import { revalidatePath } from 'next/cache'
import { approveCampaign, rejectCampaign } from '@/lib/campaigns'
import { COPY } from '@/lib/copy'
import { isCountry } from '@/lib/markets'
import { previewOffersFor } from '@/lib/offers'
import type { PreviewOffer } from '@/lib/preview-merge'
import { requireAdmin } from '@/lib/session'
import { approveWorkspace, declineWorkspace } from '@/lib/workspaces'

type Result = { ok: true } | { error: string }

async function decide(run: (adminId: string) => Promise<unknown>): Promise<Result> {
  const admin = await requireAdmin()
  try {
    await run(admin.id)
  } catch (e) {
    if (e === 'REASON_REQUIRED') return { error: COPY.review.reasonRequired }
    if (e === 'WORKSPACE_NOT_APPROVED') return { error: COPY.review.workspaceNotApproved }
    if (e === 'INVALID_TRANSITION' || e === 'NOT_FOUND') return { error: COPY.review.alreadyDecided }
    throw e
  }
  revalidatePath('/admin/review')
  return { ok: true }
}

const idOf = (v: unknown) => (typeof v === 'string' ? v : '')
const textOf = (v: unknown) => (typeof v === 'string' ? v : '')

export async function approveWorkspaceAction(id: unknown) {
  return decide((by) => approveWorkspace(idOf(id), by))
}
export async function declineWorkspaceAction(id: unknown, reason: unknown) {
  return decide((by) => declineWorkspace(idOf(id), by, textOf(reason)))
}
export async function approveCampaignAction(id: unknown) {
  return decide((by) => approveCampaign(idOf(id), by))
}
// The slice-1 Reject box sends a note only; until the reason-code modal lands it is filed under the
// code its default note describes ("Terms unclear — …").
export async function rejectCampaignAction(id: unknown, reason: unknown) {
  return decide((by) => rejectCampaign(idOf(id), by, 'misleading_terms', textOf(reason)))
}

// The offers a campaign waiting here would sit among on Phoenix.
export async function previewOffersAction(country: unknown): Promise<PreviewOffer[]> {
  await requireAdmin()
  return isCountry(country) ? previewOffersFor(country, new Date()) : []
}
