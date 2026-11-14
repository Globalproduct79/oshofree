'use server'

import { revalidatePath } from 'next/cache'
import {
  campaignInput, createCampaign, isCreditLimit, pauseCampaign, resumeCampaign, submitCampaign, updateCampaign, validateCampaign,
} from '@/lib/campaigns'
import { COPY } from '@/lib/copy'
import { MONEY } from '@/lib/copy-money'
import { db } from '@/lib/db'
import { isCountry } from '@/lib/markets'
import { previewOffersFor } from '@/lib/offers'
import type { PreviewOffer } from '@/lib/preview-merge'
import { requireUser } from '@/lib/session'
import { requireWorkspace } from '@/lib/workspaces'

type Failure = { error: string }

// Every change is scoped to the session's workspace; the client never names one.
async function change(
  workspaceId: string,
  id: unknown,
  apply: (id: string) => Promise<unknown>,
  overCredit?: string,
): Promise<{ ok: true } | Failure> {
  const row =
    typeof id === 'string'
      ? await db.campaign.findFirst({ where: { id, workspaceId }, select: { id: true } })
      : null
  if (!row) return { error: COPY.campaignForm.notFound }
  try {
    await apply(row.id)
  } catch (e) {
    if (e === 'INVALID_TRANSITION') return { error: COPY.campaignForm.invalidTransition }
    if (isCreditLimit(e)) return { error: overCredit ?? MONEY.overCredit(e.limitCents, e.excessCents) }
    throw e
  }
  revalidatePath('/app')
  return { ok: true }
}

export async function saveDraft(input: unknown, id?: string): Promise<{ id: string } | Failure> {
  const ws = await requireWorkspace()
  const parsed = campaignInput.safeParse(input)
  if (!parsed.success) return { error: COPY.campaignForm.invalid }
  const rule = validateCampaign(parsed.data)
  if (rule) return { error: rule }
  if (id === undefined) {
    const created = await createCampaign(ws.id, parsed.data)
    revalidatePath('/app')
    return { id: created.id }
  }
  const res = await change(ws.id, id, (cid) => updateCampaign(cid, parsed.data))
  return 'error' in res ? res : { id }
}

// A declined workspace can still keep drafts, but nothing it submits could ever be approved.
export async function submit(id: string): Promise<{ ok: true } | Failure> {
  const ws = await requireWorkspace()
  if (ws.status === 'declined') return { error: COPY.campaignForm.workspaceDeclined }
  const by = await requireUser()
  return change(ws.id, id, (cid) => submitCampaign(cid, by.id))
}

export async function pause(id: string) {
  const ws = await requireWorkspace()
  const by = await requireUser()
  return change(ws.id, id, (cid) => pauseCampaign(cid, by.id))
}

export async function resume(id: string) {
  const ws = await requireWorkspace()
  const by = await requireUser()
  return change(ws.id, id, (cid) => resumeCampaign(cid, by.id), MONEY.cantResume)
}

// The live offers for the Phoenix preview. They are public on Phoenix already, so this reads across workspaces.
export async function previewOffers(country: unknown): Promise<PreviewOffer[]> {
  await requireWorkspace()
  return isCountry(country) ? previewOffersFor(country, new Date()) : []
}
