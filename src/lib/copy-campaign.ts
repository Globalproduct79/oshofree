import type { RejectReason } from '@prisma/client'
import { MONEY } from '@/lib/copy-money'
import { usd } from '@/lib/format'

// The campaign lifecycle's words (ADV §1–2, F2–F3, spec §6.4), verbatim. Strings Billing shares
// (the credit refusals) live in MONEY and are named here too, so each page reads one module.

export const CAMPAIGN = {
  // Toasts.
  paused: 'Paused — leaves Phoenix within 15 minutes. Resume any time.',
  resumed: 'Resumed — back on Phoenix within 15 minutes.',
  resumeBlocked: MONEY.cantResume,
  saved: 'Saved — live within 15 minutes, no review needed',
  budgetBelowSpend: "Budget can't be below what's already spent",
  overCredit: MONEY.wouldExceed,
  ended: (releasedCents: number) => `Ended — ${usd(releasedCents)} released`,
  submitted: 'Submitted — Global reviews within one working day',
  resubmitted: 'Resubmitted — Global reviews within one working day',
  approved: 'Approved — advertiser emailed',
  rejected: 'Rejected — advertiser emailed with the reason',
  // The End campaign now confirm.
  endConfirm: 'End now? Unspent budget is released from your credit.',
} as const

// The hero's pace note (ADV §1). Scheduled, ended, rejected and draft campaigns have none.
export const PACE = {
  slow: 'Delivering slower than planned — consider extending the flight.',
  fast: 'Delivering faster than planned — budget will finish early.',
  onPace: 'On pace.',
  paused: 'Paused — not delivering. Resume any time.',
  // Ours (Prompt 5): paused by the daily job at the credit limit, Resume is refused until the limit is back.
  pausedOverCredit: 'Paused — credit limit reached. Resume once an invoice is paid or Global raises the limit.',
  review: 'Global reviews within one working day.',
} as const

// Global's reject reasons, in the modal's order (spec §6.4).
export const REJECT_REASONS: Record<RejectReason, string> = {
  misleading_terms: 'Misleading or unclear terms',
  not_available: 'Not available in market',
  broken_link: 'Broken or unsafe link',
  prohibited_category: 'Prohibited category',
  missing_licence: 'Missing licence or approval number',
  creative_standards: 'Creative standards',
}

export const isRejectReason = (v: unknown): v is RejectReason =>
  typeof v === 'string' && Object.hasOwn(REJECT_REASONS, v)

// What the advertiser reads: "{label}: {note}", or the label alone when Global left no note.
export const rejectReasonText = (code: RejectReason, note?: string | null): string =>
  note?.trim() ? `${REJECT_REASONS[code]}: ${note.trim()}` : REJECT_REASONS[code]
