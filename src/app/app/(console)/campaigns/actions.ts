'use server'

import type { Campaign } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import {
  campaignInput, createCampaign, pauseCampaign, resumeCampaign, submitCampaign, updateCampaign, validateCampaign,
} from '@/lib/campaigns'
import { COPY } from '@/lib/copy'
import { db } from '@/lib/db'
import { isCountry } from '@/lib/markets'
import { phoenixOffers, type OfferDto } from '@/lib/offers'
import { requireWorkspace } from '@/lib/workspaces'

type Failure = { error: string }

// Every change is scoped to the session's workspace; the client never names one.
async function change(
  workspaceId: string,
  id: unknown,
  apply: (id: string) => Promise<Campaign>,
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

export async function submit(id: string) {
  const ws = await requireWorkspace()
  return change(ws.id, id, submitCampaign)
}

export async function pause(id: string) {
  const ws = await requireWorkspace()
  return change(ws.id, id, pauseCampaign)
}

export async function resume(id: string) {
  const ws = await requireWorkspace()
  return change(ws.id, id, resumeCampaign)
}

// The live offers for the Phoenix preview. They are public on Phoenix already, so this reads across workspaces.
export async function previewOffers(country: unknown): Promise<OfferDto[]> {
  await requireWorkspace()
  return isCountry(country) ? phoenixOffers(country, new Date()) : []
}
