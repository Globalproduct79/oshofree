'use server'

import { revalidatePath } from 'next/cache'
import { approveCampaign, rejectCampaign } from '@/lib/campaigns'
import { COPY } from '@/lib/copy'
import { simulateDayAs, type SimulateDayResult } from '@/lib/demo/controls'
import { runDaily, type DailyResult } from '@/lib/jobs/daily'
import { isCountry } from '@/lib/markets'
import { previewOffersFor } from '@/lib/offers'
import type { PreviewOffer } from '@/lib/preview-merge'
import { isAdminInDb, requireAdmin, requireUser } from '@/lib/session'
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

// "Run daily job" (Review, non-production): Global only, and only with DEMO_CONTROLS=1. It runs today's job;
// a second click the same UTC day is a no-op ({ skipped: true }).
export async function runDailyJobAction(): Promise<{ ok: true; summary: DailyResult } | { error: 'FORBIDDEN' }> {
  const user = await requireUser()
  if (process.env.DEMO_CONTROLS !== '1' || !(await isAdminInDb(user.id))) return { error: 'FORBIDDEN' }
  const summary = await runDaily(new Date())
  revalidatePath('/', 'layout')
  return { ok: true, summary }
}

// "Simulate a day" (Review header): Global only, and only with DEMO_CONTROLS=1. One day of synthetic Phoenix
// traffic through the real pipeline, then the daily job; a second click the same UTC day is refused.
export async function simulateDayAction(): Promise<SimulateDayResult> {
  const user = await requireUser()
  return simulateDayAs(user.id)
}
