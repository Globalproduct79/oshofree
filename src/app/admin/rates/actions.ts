'use server'

import { revalidatePath } from 'next/cache'
import { RATES } from '@/lib/copy-rates'
import { isCountry } from '@/lib/markets'
import { db } from '@/lib/db'
import { PLACEMENTS, setFx, setRate } from '@/lib/rates'
import { requireAdmin } from '@/lib/session'

type Result = { toast: string } | { error: string }

const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0

export async function setRateAction(country: unknown, placement: unknown, cpm: unknown): Promise<Result> {
  const admin = await requireAdmin()
  if (!isCountry(country) || !(PLACEMENTS as readonly unknown[]).includes(placement)) return { error: RATES.invalidRate }
  if (!positive(cpm)) return { error: RATES.invalidRate }
  const channel = await db.channel.findUnique({ where: { key: 'phoenix' } })
  if (!channel) return { error: RATES.noRate }
  await setRate(channel.id, country, placement as (typeof PLACEMENTS)[number], Math.round(cpm * 100), admin.id)
  revalidatePath('/admin/rates')
  return { toast: RATES.rateToast }
}

export async function setFxAction(country: unknown, fx: unknown): Promise<Result> {
  const admin = await requireAdmin()
  if (!isCountry(country) || !positive(fx)) return { error: RATES.invalidFx }
  await setFx(country, fx, admin.id)
  revalidatePath('/admin/rates')
  return { toast: RATES.fxToast }
}
