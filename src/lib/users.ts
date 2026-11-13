import bcrypt from 'bcryptjs'
import { Prisma, type User } from '@prisma/client'
import { db } from '@/lib/db'

// Compared against when the email is unknown, so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('x', 10)

export async function createUser(input: {
  email: string
  password: string
  name: string
}): Promise<User> {
  const email = input.email.trim().toLowerCase()
  if (await db.user.findUnique({ where: { email } })) throw 'EMAIL_TAKEN'
  const passwordHash = await bcrypt.hash(input.password, 10)
  try {
    return await db.user.create({ data: { email, passwordHash, name: input.name.trim() } })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw 'EMAIL_TAKEN'
    throw e
  }
}

export async function verifyCredentials(email: string, password: string): Promise<User | null> {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } })
  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH)
    return null
  }
  return (await bcrypt.compare(password, user.passwordHash)) ? user : null
}
