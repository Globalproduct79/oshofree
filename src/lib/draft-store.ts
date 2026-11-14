import type { FormValues } from '@/components/campaign/form/values'
import { fits, RUNS_FOR } from '@/components/campaign/form/values'
import { campaignDraftInput } from '@/lib/campaign-schema'

// The New campaign form's unsent draft (spec §6.3, open question 20): kept in this browser's
// localStorage per workspace, restored when the form opens, cleared on submit and whenever another
// workspace's form opens. Storage can be missing or full; every call degrades to "no draft".

const PREFIX = 'of-draft:'

export const draftKey = (workspaceId: string) => `${PREFIX}${workspaceId}`

// The confirmation is never kept: it is given at submission, not inherited from an old session.
export function serialiseDraft(workspaceId: string, values: FormValues): string {
  return JSON.stringify({ workspaceId, values: { ...values, termsAccepted: false } })
}

const shape = campaignDraftInput.shape
const fitsSchema = (schema: { safeParse: (v: unknown) => { success: boolean } }) => (v: unknown) => schema.safeParse(v).success
const isText = (v: unknown) => typeof v === 'string'

function isCreative(v: unknown): boolean {
  if (v === null) return true
  if (typeof v !== 'object') return false
  const c = v as Record<string, unknown>
  const key = c.kind === 'image' ? shape.creativeImageKey : c.kind === 'video' ? shape.creativeVideoKey : null
  return key !== null && typeof c.key === 'string' && key.safeParse(c.key).success && typeof c.url === 'string' && c.url.startsWith('/')
}

// Each stored field is kept only if it still makes sense (an enum the schema knows, a key we issued);
// anything else falls back to the form's default, and a creative the placement cannot take is dropped.
const KEEP: Record<keyof FormValues, (v: unknown) => boolean> = {
  name: isText,
  brand: isText,
  country: fitsSchema(shape.country),
  category: fitsSchema(shape.category),
  tileColor: fitsSchema(shape.tileColor),
  headline: isText,
  description: isText,
  placement: fitsSchema(shape.placement),
  creative: isCreative,
  redeemMethod: fitsSchema(shape.redeemMethod),
  linkUrl: isText,
  budgetUsd: isText,
  runsFor: (v) => (RUNS_FOR as readonly unknown[]).includes(v),
  startsAt: isText,
  endsAt: isText,
  rewardLocal: isText,
  termsAccepted: () => false,
}

// The stored draft over the defaults, or null when there is none for this workspace.
export function parseDraft(raw: string | null, workspaceId: string, defaults: FormValues): FormValues | null {
  if (!raw) return null
  let stored: unknown
  try {
    stored = JSON.parse(raw)
  } catch {
    return null
  }
  if (stored === null || typeof stored !== 'object') return null
  const { workspaceId: owner, values } = stored as { workspaceId?: unknown; values?: unknown }
  if (owner !== workspaceId || values === null || typeof values !== 'object') return null
  const v = values as Record<string, unknown>
  const out = { ...defaults }
  for (const k of Object.keys(KEEP) as (keyof FormValues)[]) {
    if (Object.hasOwn(v, k) && KEEP[k](v[k])) (out as Record<string, unknown>)[k] = v[k]
  }
  return fits(out.placement, out.creative) ? out : { ...out, creative: null }
}

// ---- The browser side ----

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function saveDraft(workspaceId: string, values: FormValues): void {
  try {
    storage()?.setItem(draftKey(workspaceId), serialiseDraft(workspaceId, values))
  } catch {
    // Full or blocked: the draft is a convenience.
  }
}

export function clearDraft(workspaceId: string): void {
  try {
    storage()?.removeItem(draftKey(workspaceId))
  } catch {
    // Nothing to clear.
  }
}

// "Start over": the draft goes and the form takes its defaults again (an agency's ?brand= included).
export function startOver(workspaceId: string, defaults: FormValues): FormValues {
  clearDraft(workspaceId)
  return defaults
}

// This workspace's draft; any other workspace's draft is dropped on the way (a switch clears it).
export function loadDraft(workspaceId: string, defaults: FormValues): FormValues | null {
  const s = storage()
  if (!s) return null
  try {
    for (let i = s.length - 1; i >= 0; i--) {
      const key = s.key(i)
      if (key?.startsWith(PREFIX) && key !== draftKey(workspaceId)) s.removeItem(key)
    }
    return parseDraft(s.getItem(draftKey(workspaceId)), workspaceId, defaults)
  } catch {
    return null
  }
}

// This workspace's stored draft as it is kept (parseDraft reads it), touching no other: Campaigns home shows it as a
// card, and only opening the form clears another workspace's draft. A string, so it can be an external store's snapshot.
export function storedDraft(workspaceId: string): string | null {
  try {
    return storage()?.getItem(draftKey(workspaceId)) ?? null
  } catch {
    return null
  }
}
