import type { Role } from '@prisma/client'
import { fd } from '@/lib/format'
import type { OpenInvite } from '@/lib/invitations'
import { MARKETS, type Country } from '@/lib/markets'

// An invite as the lists show it: dates already on the market's clock, and no token.
export type InviteView = { id: string; email: string; role: Role; invitedBy: string | null; expires: string; expired: boolean }

export const inviteViews = (rows: OpenInvite[], country: Country, now = new Date()): InviteView[] =>
  rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    invitedBy: r.invitedBy,
    expires: fd(r.expiresAt, MARKETS[country].timezone),
    expired: r.expiresAt.getTime() <= now.getTime(),
  }))
