import type { Role } from '@prisma/client'
import { fd } from '@/lib/format'
import type { OpenInvite } from '@/lib/invitations'
import { MARKETS, type Country } from '@/lib/markets'

// When an invite's link stops working, on the workspace market's clock: '21 Nov'. The lists and the invite and
// resend actions all say it this way.
export const inviteExpiry = (at: Date, country: Country): string => fd(at, MARKETS[country].timezone)

// An invite as the lists show it: dates already on the market's clock, and no token.
export type InviteView = { id: string; email: string; role: Role; invitedBy: string | null; expires: string; expired: boolean }

export const inviteViews = (rows: OpenInvite[], country: Country, now = new Date()): InviteView[] =>
  rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    invitedBy: r.invitedBy,
    expires: inviteExpiry(r.expiresAt, country),
    expired: r.expiresAt.getTime() <= now.getTime(),
  }))
