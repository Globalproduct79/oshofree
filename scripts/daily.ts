import { db } from '@/lib/db'
import { runDaily } from '@/lib/jobs/daily'

// `npm run job:daily`, once a day from cron. It charges the market day that has just finished — the one
// containing now − 24 h, which is over in every market by now — and moves campaigns, payouts, the month
// close and notifications at the real time. Charging today instead would bill only the hours since
// midnight, and the rest of the day would never be charged.
const DAY_MS = 86_400_000

async function main() {
  const now = new Date()
  const summary = await runDaily(new Date(now.getTime() - DAY_MS), now)
  console.log(JSON.stringify(summary))
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
