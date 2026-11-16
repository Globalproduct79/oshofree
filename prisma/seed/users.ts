import type { User } from '@prisma/client'
import { db } from '@/lib/db'
import { createUser } from '@/lib/users'

export const PASSWORD = 'password'

// The prototype's people (spec §6.13, ADV §9 and §14), plus Global. The seed prints this list.
export const LOGINS = [
  { key: 'admin', email: 'admin@oshofree.demo', name: 'Global Admin', shows: 'Global' },
  { key: 'tunde', email: 'tunde@kolabright.demo', name: 'Tunde Okafor', shows: 'Owner, Kola Bright' },
  { key: 'ada', email: 'ada@kolabright.demo', name: 'Ada Eze', shows: 'Manager, Kola Bright' },
  { key: 'dolapo', email: 'dolapo@mediaspec.demo', name: 'Dolapo Adeyemi', shows: 'Owner, MediaSpec (agency)' },
  { key: 'chidi', email: 'chidi@mediaspec.demo', name: 'Chidi Nwosu', shows: 'Manager, MediaSpec (agency)' },
  { key: 'kemi', email: 'kemi@mediaspec.demo', name: 'Kemi Balogun', shows: 'Viewer, MediaSpec (agency)' },
  { key: 'wanjiru', email: 'wanjiru@pesalink.demo', name: 'Wanjiru Kamau', shows: 'Owner, Pesa Link' },
  { key: 'kofi', email: 'kofi@sunfresh.demo', name: 'Kofi Mensah', shows: 'Owner, SunFresh Juices (awaiting approval)' },
] as const

export type PersonKey = (typeof LOGINS)[number]['key']
export type People = Record<PersonKey, User>

// Each is demo data (Prompt 9): `npm run demo:remove` deletes them, and only them.
export async function seedUsers(): Promise<People> {
  const people = {} as People
  for (const { key, email, name } of LOGINS) {
    const made = await createUser({ email, password: PASSWORD, name })
    people[key] = await db.user.update({ where: { id: made.id }, data: { demo: true } })
  }
  people.admin = await db.user.update({ where: { id: people.admin.id }, data: { isGlobalAdmin: true } })
  return people
}
