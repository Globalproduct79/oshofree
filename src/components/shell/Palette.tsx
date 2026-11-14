'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { platformSearchAction } from '@/app/admin/search/actions'
import { searchAction } from '@/app/app/(console)/search/actions'
import { switchWorkspaceToAction } from '@/app/app/(console)/switch/actions'
import { SHELL } from '@/lib/copy-shell'
import type { Hit } from '@/lib/search'
import { Modal } from './Modal'
import { subscribePalette } from './palette-store'

type Row = Hit & { workspaceId?: string }
type Group = { key: string; title: string; rows: Row[] }

const DEBOUNCE_MS = 150
const G = SHELL.search.groups

// The command palette (spec §6.9): ⌘K / Ctrl+K or the topbar search opens it; a debounced search per
// mode; arrows move across the groups, Enter opens the highlighted row, Escape closes.
export function Palette({ mode }: { mode: 'workspace' | 'platform' }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [groups, setGroups] = useState<Group[]>([])
  const [searched, setSearched] = useState(false)
  const [cursor, setCursor] = useState(0)
  const seq = useRef(0)

  const close = () => {
    setOpen(false)
    setQ('')
    setGroups([])
    setSearched(false)
    setCursor(0)
  }

  useEffect(() => subscribePalette(() => setOpen(true)), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!open) return
    const id = ++seq.current
    if (q.trim().length < 2) {
      setGroups([])
      setSearched(false)
      return
    }
    const t = setTimeout(async () => {
      try {
        let next: Group[]
        if (mode === 'workspace') {
          const r = await searchAction(q)
          next = [
            { key: 'campaigns', title: G.campaigns, rows: r.campaigns },
            { key: 'invoices', title: G.invoices, rows: r.invoices },
            { key: 'people', title: G.people, rows: r.people },
          ]
        } else {
          const r = await platformSearchAction(q)
          next = [
            { key: 'workspaces', title: G.workspaces, rows: r.workspaces },
            { key: 'campaigns', title: G.campaigns, rows: r.campaigns },
          ]
        }
        if (id !== seq.current) return
        setGroups(next.filter((g) => g.rows.length > 0))
        setSearched(true)
        setCursor(0)
      } catch {
        if (id === seq.current) setSearched(false)
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [q, open, mode])

  const flat = useMemo(() => groups.flatMap((g) => g.rows.map((r) => ({ ...r, group: g.key }))), [groups])

  const go = (r: Row & { group?: string }) => {
    close()
    // A platform campaign lives inside its workspace: switch in, landing on the campaign.
    if (mode === 'platform' && r.group === 'campaigns' && r.workspaceId) void switchWorkspaceToAction(r.workspaceId, r.href)
    else router.push(r.href)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (flat.length === 0) return
      setCursor((c) => (c + (e.key === 'ArrowDown' ? 1 : -1) + flat.length) % flat.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const r = flat[cursor] ?? flat[0]
      if (r) go(r)
    }
  }

  let index = -1
  return (
    <Modal open={open} onClose={close} title={SHELL.search.label} narrow>
      <div className="palette" onKeyDown={onKeyDown}>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={mode === 'platform' ? SHELL.search.placeholderGlobal : SHELL.search.placeholder}
          aria-label={SHELL.search.label}
          autoComplete="off"
        />
        {groups.map((g) => (
          <div key={g.key} role="group" aria-label={g.title}>
            <div className="h">{g.title}</div>
            {g.rows.map((r) => {
              const i = ++index
              return (
                <button
                  key={g.key + r.id}
                  type="button"
                  tabIndex={-1}
                  className={i === cursor ? 'on' : undefined}
                  aria-current={i === cursor}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go({ ...r, group: g.key })}
                >
                  {r.label}
                  <small>{r.sub}</small>
                </button>
              )
            })}
          </div>
        ))}
        {searched && groups.length === 0 && <p className="sub">{SHELL.search.empty}</p>}
      </div>
    </Modal>
  )
}
