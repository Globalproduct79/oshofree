import { Prisma } from '@prisma/client'
import { beforeEach } from 'vitest'
import { db } from '@/lib/db'

export async function resetDb() {
  const tables = Prisma.dmmf.datamodel.models.map((m) => `"${m.dbName ?? m.name}"`).join(', ')
  await db.$executeRawUnsafe(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`)
}

beforeEach(async () => {
  await resetDb()
})
