import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

// No server-only import: the daily job (`npm run job:daily`, under tsx) loads this and the DB-side
// modules that use it — money, notifications, rates, rewards and campaigns.

// The daily job's actor: it acts as no user, so its rows store a null actor.
export const SYSTEM_ACTOR = 'system'

export async function audit(
  actorId: string,
  action: string,
  target: { type: string; id: string; workspaceId?: string },
  before?: Prisma.InputJsonValue,
  after?: Prisma.InputJsonValue,
): Promise<void> {
  await db.auditEvent.create({
    data: {
      actorId: actorId === SYSTEM_ACTOR ? null : actorId,
      action, targetType: target.type, targetId: target.id, workspaceId: target.workspaceId, before, after,
    },
  })
}
