'use client'

import { Check, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { SwitcherItem } from '@/lib/active-workspace'
import { switchToPlatformAction, switchWorkspaceAction } from '@/app/app/(console)/switch/actions'
import { DemoPill } from '@/components/og/DemoPill'
import { SubmitButton } from '@/components/og/SubmitButton'
import { SHELL } from '@/lib/copy-shell'
import { initials, tileColorAt } from '@/lib/format'
import { isCountry, MARKETS } from '@/lib/markets'
import { tokens } from '@/lib/tokens'
import { ROW_BUTTON } from './BellPanel'

export type { SwitcherItem }

const countryName = (c: string) => (isCountry(c) ? MARKETS[c].name : c)

// The find field appears once the list is long enough to need one.
const FIND_FROM = 4

// "▦ Workspaces" opens this instead of the prototype's native <select> (spec §6.2): a find field when the list is
// long, the count, then one row per workspace — its tile, name (the Demo pill on a seeded one), type · country and,
// unless approved, its state — with a status dot, the row you are in ticked; then "Platform (Global)" for Global.
// ↑↓ move the highlight and ↵ opens it. Sign out is under the account menu (the avatar). Each row is a form's
// submit, off while its press is on its way (Prompt 10).
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
  const [q, setQ] = useState('')
  const [hi, setHi] = useState<number | null>(null)
  const forms = useRef<(HTMLFormElement | null)[]>([])
  useEffect(() => {
    if (!open) return
    setQ('')
    setHi(null)
  }, [open])
  if (!open) return null

  const s = SHELL.switcher
  const needle = q.trim().toLowerCase()
  const shown = needle ? items.filter((w) => w.name.toLowerCase().includes(needle)) : items
  const rows = shown.length + (isGlobal ? 1 : 0)
  const at = hi === null ? null : Math.min(hi, Math.max(rows - 1, 0))

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (rows) setHi(at === null ? (e.key === 'ArrowDown' ? 0 : rows - 1) : (at + (e.key === 'ArrowDown' ? 1 : rows - 1)) % rows)
    } else if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
      e.preventDefault()
      forms.current[at ?? 0]?.requestSubmit()
    }
  }

  return (
    <div className="notif on wsp" id={id} data-pop="switcher" role="region" aria-label={s.title} onKeyDown={onKey}>
      {items.length >= FIND_FROM && (
        <label className="find">
          <Search size={16} aria-hidden="true" />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setHi(null)
            }}
            placeholder={s.find}
            aria-label={s.find}
          />
        </label>
      )}
      <div className="h">
        {s.title}
        <span className="n">· {shown.length}</span>
      </div>
      {shown.length === 0 && <div className="me">{s.none}</div>}
      {shown.map((w, i) => {
        const current = w.id === currentId
        const state = w.status === 'approved' ? '' : s.state[w.status]
        return (
          <div key={w.id} className={current ? 'cur' : undefined} data-hi={i === at || undefined}>
            <form action={switchWorkspaceAction.bind(null, w.id)} ref={(el) => void (forms.current[i] = el)}>
              <SubmitButton plain className={`${ROW_BUTTON} flex items-center gap-3`} aria-current={current ? 'true' : undefined}>
                <span className="tile" style={{ background: tileColorAt(items.indexOf(w)) }} aria-hidden="true">
                  {initials(w.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <b className="truncate">{w.name}</b>
                    {w.demo && <> <DemoPill /></>}
                  </span>
                  <small>{s.sub(w.type, countryName(w.country), state)}</small>
                </span>
                <i className={`dot dot-${w.status}`} title={state || undefined} />
                {current && <Check size={16} aria-hidden="true" className="tick" />}
              </SubmitButton>
            </form>
          </div>
        )
      })}
      {isGlobal && (
        <div className={`pf${currentId === null ? ' cur' : ''}`} data-hi={shown.length === at || undefined}>
          <form action={switchToPlatformAction} ref={(el) => void (forms.current[shown.length] = el)}>
            <SubmitButton
              plain
              className={`${ROW_BUTTON} flex items-center gap-3`}
              aria-current={currentId === null ? 'true' : undefined}
            >
              <span className="tile" style={{ background: tokens.ink }} aria-hidden="true">
                {SHELL.brand.tile}
              </span>
              <span className="min-w-0 flex-1">
                <b>{s.platform}</b>
                <small>{s.platformSub}</small>
              </span>
              {currentId === null && <Check size={16} aria-hidden="true" className="tick" />}
            </SubmitButton>
          </form>
        </div>
      )}
      <div className="ft">{s.keys}</div>
    </div>
  )
}
