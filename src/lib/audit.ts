import 'server-only'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

export async function audit(
  actorId: string,
  action: string,
  target: { type: string; id: string; workspaceId?: string },
  before?: Prisma.InputJsonValue,
  after?: Prisma.InputJsonValue,
): Promise<void> {
  await db.auditEvent.create({
    data: { actorId, action, targetType: target.type, targetId: target.id, workspaceId: target.workspaceId, before, after },
  })
}
