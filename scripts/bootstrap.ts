import { pathToFileURL } from 'node:url'
import { bootstrap, summaryLine } from '@/lib/bootstrap'
import { db } from '@/lib/db'

// `npm run bootstrap`: on every production deploy, after `npx prisma migrate deploy` and before the app serves.
// It makes the Global user (BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD), the Phoenix channel
// (PHOENIX_CHANNEL_KEY, or a key it makes and prints this once), Phoenix's reference rates, FX and share, the
// fraud rules and the aggregator account — each only if missing (lib/bootstrap). Never the seed's job, and never
// for the development database. Exits 1, having written nothing, when it cannot make a Global user.
async function main() {
  const result = await bootstrap({
    adminEmail: process.env.BOOTSTRAP_ADMIN_EMAIL,
    adminPassword: process.env.BOOTSTRAP_ADMIN_PASSWORD,
    phoenixKey: process.env.PHOENIX_CHANNEL_KEY,
  })
  console.log(summaryLine(result))
  for (const note of result.notes) console.log(note)
  if (result.generatedKey) {
    console.log(`Phoenix channel key: ${result.generatedKey}`)
    console.log('Store this now and give it to Phoenix: it is shown this once, and only its hash is kept.')
  }
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
