import { Prisma } from '@prisma/client'
import { beforeEach } from 'vitest'
import { db } from '@/lib/db'

export async function resetDb() {
  const [{ name }] = await db.$queryRaw<{ name: string }[]>`select current_database() as name`
  if (!name.endsWith('_test')) throw new Error('resetDb refuses to run against a database not named *_test')
  const tables = Prisma.dmmf.datamodel.models.map((m) => `"${m.dbName ?? m.name}"`).join(', ')
  await db.$executeRawUnsafe(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`)
}

beforeEach(async () => {
  await resetDb()
})
