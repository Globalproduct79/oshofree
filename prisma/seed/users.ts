import { db } from '@/lib/db'
import { createUser } from '@/lib/users'

const PASSWORD = 'password'

export async function seedUsers() {
  const admin = await createUser({ email: 'admin@oshofree.demo', password: PASSWORD, name: 'Global Admin' })
  await db.user.update({ where: { id: admin.id }, data: { isGlobalAdmin: true } })
  const tunde = await createUser({ email: 'tunde@kolabright.demo', password: PASSWORD, name: 'Tunde Okafor' })
  const ada = await createUser({ email: 'ada@zurifoods.demo', password: PASSWORD, name: 'Ada Eze' })
  const kola = await db.workspace.create({
    data: { name: 'Kola Bright', type: 'Brand', country: 'NG', status: 'approved',
      members: { create: { userId: tunde.id, role: 'Owner' } } },
  })
  await db.workspace.create({
    data: { name: 'Zuri Foods', type: 'Brand', country: 'NG', status: 'pending',
      members: { create: { userId: ada.id, role: 'Owner' } } },
  })
  return { admin, tunde, ada, kola }
}
