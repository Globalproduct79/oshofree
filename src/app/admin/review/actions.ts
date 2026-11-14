'use server'

import { revalidatePath } from 'next/cache'
import { approveCampaign, approveRevision, rejectCampaign, rejectRevision } from '@/lib/campaigns'
import { isRejectReason } from '@/lib/copy-campaign'
import { REVIEW } from '@/lib/copy-review'
import { simulateDayAs, type SimulateDayResult } from '@/lib/demo/controls'
import { previousMarketDay, runDaily, type DailyResult } from '@/lib/jobs/daily'
import { isCountry } from '@/lib/markets'
import { previewOffersFor } from '@/lib/offers'
import type { PreviewOffer } from '@/lib/preview-merge'
import { isAdminInDb, requireAdmin, requireUser } from '@/lib/session'
import { approveWorkspace, declineWorkspace } from '@/lib/workspaces'

// Global's decisions on the Review page (GLB §2.1, spec §6.4). Each answers with the toast to show: what was
// done, or why nothing was (a refusal is a toast, not an error page).
export type ReviewResult = { ok: true; toast: string } | { error: string }

const E = REVIEW.errors
const REFUSALS: Record<string, string> = {
  REASON_REQUIRED: E.reasonRequired,
  WORKSPACE_NOT_APPROVED: E.workspaceFirst,
  FLIGHT_ENDED: E.flightEnded,
  INVALID_TRANSITION: E.alreadyDecided,
  NOT_FOUND: E.alreadyDecided,
}

// Global only; after a decision every layout redraws, so the Review badge and the bell move with it (D2).
async function decide(run: (adminId: string) => Promise<string>): Promise<ReviewResult> {
  const admin = await requireAdmin()
  let toast: string
  try {
    toast = await run(admin.id)
  } catch (e) {
    if (typeof e === 'string' && Object.hasOwn(REFUSALS, e)) return { error: REFUSALS[e] }
    throw e
  }
  revalidatePath('/', 'layout')
  return { ok: true, toast }
}

const textOf = (v: unknown) => (typeof v === 'string' ? v : '')
// A reason code off the list is no reason code.
const codeOf = (v: unknown) => {
  if (!isRejectReason(v)) throw 'REASON_REQUIRED'
  return v
}

export async function approveWorkspaceAction(id: unknown): Promise<ReviewResult> {
  return decide(async (by) => REVIEW.toast.workspaceApproved((await approveWorkspace(textOf(id), by)).name))
}

export async function declineWorkspaceAction(id: unknown, reason: unknown): Promise<ReviewResult> {
  return decide(async (by) => REVIEW.toast.workspaceDeclined((await declineWorkspace(textOf(id), by, textOf(reason))).name))
}

export async function approveCampaignAction(id: unknown): Promise<ReviewResult> {
  return decide(async (by) => {
    await approveCampaign(textOf(id), by)
    return REVIEW.toast.approved
  })
}

// The code is required; the note may be empty (spec §6.4).
export async function rejectCampaignAction(id: unknown, code: unknown, note: unknown): Promise<ReviewResult> {
  return decide(async (by) => {
    await rejectCampaign(textOf(id), by, codeOf(code), textOf(note))
    return REVIEW.toast.rejected
  })
}

// A revised offer (spec §6.14.3): Approve swaps it into the running campaign; Reject leaves the campaign as it was.
export async function approveRevisionAction(id: unknown): Promise<ReviewResult> {
  return decide(async (by) => {
    await approveRevision(textOf(id), by)
    return REVIEW.toast.approved
  })
}

export async function rejectRevisionAction(id: unknown, code: unknown, note: unknown): Promise<ReviewResult> {
  return decide(async (by) => {
    await rejectRevision(textOf(id), by, codeOf(code), textOf(note))
    return REVIEW.toast.rejected
  })
}

// The offers a campaign waiting here would sit among on Phoenix.
export async function previewOffersAction(country: unknown): Promise<PreviewOffer[]> {
  await requireAdmin()
  return isCountry(country) ? previewOffersFor(country, new Date()) : []
}

// "Run daily job" (Review, non-production): Global only, and only with DEMO_CONTROLS=1. The cron's run (spec
// §6.7): the market day that has just finished, every other duty at now — replayed past the once-a-day guard, so
// each click runs. A replay is always safe: every duty is idempotent and a day's delivery line is raised to the
// day's total, never charged twice. Before the 02:00 UTC run, a click is that run, which then finds its day done.
export async function runDailyJobAction(): Promise<{ ok: true; summary: DailyResult } | { error: 'FORBIDDEN' }> {
  const user = await requireUser()
  if (process.env.DEMO_CONTROLS !== '1' || !(await isAdminInDb(user.id))) return { error: 'FORBIDDEN' }
  const now = new Date()
  const summary = await runDaily(previousMarketDay(now), now, { replay: true })
  revalidatePath('/', 'layout')
  return { ok: true, summary }
}

// "Simulate a day" (Review header): Global only, and only with DEMO_CONTROLS=1. One day of synthetic Phoenix
// traffic through the real pipeline, then the daily job; a second click the same UTC day is refused.
export async function simulateDayAction(): Promise<SimulateDayResult> {
  const user = await requireUser()
  return simulateDayAs(user.id)
}
