'use client'

import type { SwitcherItem } from '@/lib/active-workspace'
import { signOutAction, switchToPlatformAction, switchWorkspaceAction } from '@/app/app/(console)/switch/actions'
import { COPY } from '@/lib/copy'
import { SHELL } from '@/lib/copy-shell'
import { isCountry, MARKETS } from '@/lib/markets'
import { ROW_BUTTON } from './BellPanel'

export type { SwitcherItem }

const countryName = (c: string) => (isCountry(c) ? MARKETS[c].name : c)

// "▦ Workspaces" opens this instead of the prototype's native <select> (spec §6.2): one row per
// workspace with its type, country and status, then "Platform (Global)" for Global, then Sign out.
export function Switcher({
  id,
  open,
  items,
  currentId,
  isGlobal,
}: {
  id: string
  open: boolean
  items: SwitcherItem[]
  currentId: string | null
  isGlobal: boolean
}) {
  if (!open) return null
  const s = SHELL.switcher
  return (
    <div className="notif on" id={id} data-pop="switcher" role="region" aria-label={s.title}>
      <div className="h">{s.title}</div>
      {items.map((w) => (
        <div key={w.id}>
          <form action={switchWorkspaceAction.bind(null, w.id)}>
            <button
              type="submit"
              className={`${ROW_BUTTON} flex items-center gap-3`}
              aria-current={w.id === currentId ? 'true' : undefined}
            >
              <span className="min-w-0 flex-1">
                <b>{w.name}</b>
                <small>{s.sub(w.type, countryName(w.country))}</small>
              </span>
              <span className={`st st-${w.status}`}>{COPY.status[w.status]}</span>
            </button>
          </form>
        </div>
      ))}
      {isGlobal && (
        <div>
          <form action={switchToPlatformAction}>
            <button type="submit" className={`${ROW_BUTTON} block`} aria-current={currentId === null ? 'true' : undefined}>
              <b>{s.platform}</b>
            </button>
          </form>
        </div>
      )}
      <div>
        <form action={signOutAction}>
          <button type="submit" className={`${ROW_BUTTON} block`}>
            {s.signOut}
          </button>
        </form>
      </div>
    </div>
  )
}
