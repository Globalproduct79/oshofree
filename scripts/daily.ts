import { pathToFileURL } from 'node:url'
import { db } from '@/lib/db'
import { runDaily } from '@/lib/jobs/daily'

// `npm run job:daily`, once a day from cron. It charges the market day that has just finished — the one
// containing now − 24 h, which is over in every market by now — and moves campaigns, payouts, the month
// close and notifications at the real time. Charging today instead would bill only the hours since
// midnight, and the rest of the day would never be charged.
//
// `npm run job:daily -- 2026-11-10` replays that day past the once-a-day guard, after a run that listed
// errors: every duty is idempotent and charges dedupe per campaign and market day. The day must be over in
// every market, so a replay never charges part of a day. Exits 1 when the run lists errors.
const DAY_MS = 86_400_000

export function jobDay(arg: string | undefined, now: Date): { day: Date; replay: boolean } {
  if (arg === undefined) return { day: new Date(now.getTime() - DAY_MS), replay: false }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(arg)
  const [year, month, date] = m ? [Number(m[1]), Number(m[2]) - 1, Number(m[3])] : [NaN, NaN, NaN]
  // Noon UTC is inside that calendar day in every market (UTC+0 to UTC+3).
  const day = new Date(Date.UTC(year, month, date, 12))
  if (!m || day.getUTCFullYear() !== year || day.getUTCMonth() !== month || day.getUTCDate() !== date) {
    throw new Error(`"${arg}" is not a date. Give the day as YYYY-MM-DD.`)
  }
  if (Date.UTC(year, month, date + 1) > now.getTime()) throw new Error(`${arg} is not over in every market yet.`)
  return { day, replay: true }
}

async function main() {
  const now = new Date()
  const { day, replay } = jobDay(process.argv[2], now)
  const result = await runDaily(day, now, { replay })
  console.log(JSON.stringify(result))
  if (!result.skipped && result.errors.length) process.exitCode = 1
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  main()
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e)
      process.exitCode = 1
    })
    .finally(() => db.$disconnect())
}
