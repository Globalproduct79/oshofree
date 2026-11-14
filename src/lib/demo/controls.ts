import 'server-only'
import { revalidatePath } from 'next/cache'
import { audit } from '@/lib/audit'
import type { SimulateError } from '@/lib/copy-demo'
import { prng } from '@/lib/demo/prng'
import { simulateDay, type SimulateSummary } from '@/lib/demo/simulate-day'
import { isAdminInDb } from '@/lib/session'

const DAY_MS = 86_400_000

// The demo controls ("Simulate a day", "Run daily job") exist only with DEMO_CONTROLS=1 and only for Global
// (spec §6.7, §11 item 6).
export const demoControlsOn = (isGlobal: boolean): boolean => isGlobal && process.env.DEMO_CONTROLS === '1'

export type SimulateDayResult = { ok: true; summary: SimulateSummary } | { error: SimulateError }

// "Simulate a day" for the signed-in user, wherever the button was clicked: the database says whether they are
// Global. The day seeds the generator, so a retry after a failure replays the same rows.
export async function simulateDayAs(userId: string, now = new Date()): Promise<SimulateDayResult> {
  if (!demoControlsOn(await isAdminInDb(userId))) return { error: 'FORBIDDEN' }
  let summary: SimulateSummary
  try {
    summary = await simulateDay(now, prng(Math.floor(now.getTime() / DAY_MS)))
  } catch (e) {
    if (e === 'ALREADY_SIMULATED' || e === 'NO_PHOENIX') return { error: e }
    throw e
  }
  const { runId, job, ...counts } = summary
  await audit(userId, 'demo.simulate', { type: 'JobRun', id: runId }, undefined, { ...counts, job })
  revalidatePath('/', 'layout')
  return { ok: true, summary }
}
