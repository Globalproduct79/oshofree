'use server'

import { revalidatePath } from 'next/cache'
import { audit } from '@/lib/audit'
import { requestCredit } from '@/lib/money'
import { requireMember } from '@/lib/permissions'

// Owner or Global asks for a higher limit. A second click returns the same open request.
export async function requestCreditAction(): Promise<{ ok: true }> {
  const { user, workspace, role } = await requireMember('requestCredit')
  const request = await requestCredit(workspace.id, user.id)
  if (role === 'Global') await audit(user.id, 'credit.request', { type: 'CreditRequest', id: request.id, workspaceId: workspace.id })
  revalidatePath('/app/billing')
  return { ok: true }
}
