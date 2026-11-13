import { PrismaClient } from '@prisma/client'

const globalForDb = globalThis as unknown as { db?: PrismaClient }

export const db = globalForDb.db ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForDb.db = db

// The client inside db.$transaction, or db itself.
export type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>
