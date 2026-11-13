import { pathToFileURL } from 'node:url'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

// Empties every application table. It refuses any database not named *_test, so a stray
// DATABASE_URL can never empty the development data. Vitest's setup and `npm run test:e2e` both use it.
export async function resetDb() {
  const [{ name }] = await db.$queryRaw<{ name: string }[]>`select current_database() as name`
  if (!name.endsWith('_test')) throw new Error('resetDb refuses to run against a database not named *_test')
  const tables = Prisma.dmmf.datamodel.models.map((m) => `"${m.dbName ?? m.name}"`).join(', ')
  await db.$executeRawUnsafe(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`)
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  resetDb()
    .then(() => console.log('Emptied every table in the test database.'))
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e)
      process.exitCode = 1
    })
    .finally(() => db.$disconnect())
}
