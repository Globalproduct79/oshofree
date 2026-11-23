'use client'

import type { Role } from '@prisma/client'
import { useTransition } from 'react'
import { Button } from '@/components/og'
import { toast } from '@/components/shell/toast-store'
import { PEOPLE } from '@/lib/copy-people'
import { initials } from '@/lib/format'
import type { MemberView } from '@/lib/invitations'
import { changeRoleAction, removeMemberAction } from './actions'

// Every member: initials, name (and "you"), email and role. Those who manage people get the role select and
// Remove; the last Owner can be neither demoted nor removed, so their select is locked (its title says why) and
// there is no Remove to press.
// Each action revalidates /app/people, so its answer carries the page as the server now has it. No router.refresh()
// on top: with one, about 1 change in 17 on the production build left the transition pending for good (every control
// disabled, the old list shown until a reload); without it about 1 in 70 still does (Next's router: its update is
// fulfilled, React never retries the suspended lane). Prompt 6's report has the measurements.
export function TeamList({ canManage, members, meId }: { canManage: boolean; members: MemberView[]; meId: string }) {
  const [busy, start] = useTransition()

  const change = (userId: string, next: string) =>
    start(async () => {
      const r = await changeRoleAction(userId, next)
      if (r.error) toast(PEOPLE.lastOwner)
    })
  const remove = (userId: string) =>
    start(async () => {
      const r = await removeMemberAction(userId)
      if (r.error) toast(PEOPLE.lastOwnerRemove)
    })

  return (
    <ul className="roles">
      {members.map((m) => (
        <li key={m.userId} className="team-row">
          <span className="av">{initials(m.name)}</span>
          <div className="nm">
            <b>{m.name}</b>
            {m.userId === meId && <span className="tagp">{PEOPLE.you}</span>}
            <small>{m.email}</small>
          </div>
          <div className="ctl">
            {canManage ? (
              <select
                className="sel"
                aria-label={PEOPLE.roleFor(m.name)}
                value={m.role}
                disabled={busy || m.isLastOwner}
                title={m.isLastOwner ? PEOPLE.lastOwner : undefined}
                onChange={(e) => change(m.userId, e.target.value)}
              >
                {(['Owner', 'Manager', 'Viewer'] satisfies Role[]).map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            ) : (
              <span className="tagp">{m.role}</span>
            )}
            {canManage && !m.isLastOwner && (
              <Button variant="ghost" size="s" disabled={busy} onClick={() => remove(m.userId)}>
                {PEOPLE.remove}
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
