'use client'

import { Bell, ChevronDown, LayoutGrid, Menu, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { SwitcherItem } from '@/lib/active-workspace'
import { SHELL } from '@/lib/copy-shell'
import { tokens } from '@/lib/tokens'
import { openPalette } from './palette-store'
import { BellPanel, type BellItem } from './BellPanel'
import { setDrawer, SIDEBAR_ID, useDrawer } from './Sidebar'
import { Switcher } from './Switcher'

type Popover = 'bell' | 'switcher'
const PANEL_ID: Record<Popover, string> = { bell: 'bell-panel', switcher: 'switcher' }

// The topbar (GLB §4.3): menu (below 980 px), search, bell, "Workspaces", avatar + current name.
export function TopBar({
  unread,
  notifications,
  switcher,
  avatar,
  isGlobal,
}: {
  unread: number
  notifications: BellItem[]
  switcher: { items: SwitcherItem[]; currentId: string | null; currentName: string }
  avatar: string
  isGlobal: boolean
}) {
  const drawer = useDrawer()
  const [open, setOpen] = useState<Popover | null>(null)
  const opener = useRef<HTMLElement | null>(null)

  // Any click outside the open panel and its buttons closes it; Escape closes it and returns focus.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!(e.target as Element | null)?.closest?.(`[data-pop="${open}"]`)) setOpen(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(null)
      opener.current?.focus()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = (which: Popover) => (e: React.MouseEvent<HTMLElement>) => {
    opener.current = e.currentTarget
    setOpen((o) => (o === which ? null : which))
  }
  const trigger = (which: Popover) => ({
    'data-pop': which,
    'aria-expanded': open === which,
    'aria-controls': PANEL_ID[which],
    onClick: toggle(which),
  })

  return (
    <header className="top">
      <button
        type="button"
        className="burger hidden size-[38px] shrink-0 items-center justify-center rounded-[10px] border-0 bg-transparent"
        style={{ color: tokens.ink2 }}
        aria-label={SHELL.menu}
        aria-controls={SIDEBAR_ID}
        aria-expanded={drawer}
        onClick={() => setDrawer(!drawer)}
      >
        <Menu size={20} aria-hidden="true" />
      </button>
      <button type="button" className="search" aria-label={SHELL.search.label} data-palette="" onClick={openPalette}>
        <Search size={18} aria-hidden="true" />
        <span>{SHELL.search.placeholder}</span>
        <kbd>{SHELL.search.kbd}</kbd>
      </button>
      <button type="button" className="bell" {...trigger('bell')}>
        <Bell size={18} aria-hidden="true" />
        <span className="sr-only">{SHELL.bell.label}</span>
        {unread > 0 && <i>{unread}</i>}
      </button>
      <button type="button" className="wsbtn" {...trigger('switcher')}>
        <LayoutGrid size={16} aria-hidden="true" />
        {SHELL.switcher.button}
      </button>
      <div className="who min-w-0">
        <span className="av" aria-hidden="true">
          {avatar}
        </span>
        <button
          type="button"
          className="wsname flex min-w-0 max-w-[190px] items-center gap-1.5 border-0 bg-transparent px-0 py-1.5 text-inherit"
          aria-label={SHELL.switcher.label(switcher.currentName)}
          {...trigger('switcher')}
        >
          <span className="truncate">{switcher.currentName}</span>
          <ChevronDown size={16} aria-hidden="true" className="shrink-0" />
        </button>
      </div>
      <BellPanel id={PANEL_ID.bell} open={open === 'bell'} items={notifications} onClose={() => setOpen(null)} />
      <Switcher
        id={PANEL_ID.switcher}
        open={open === 'switcher'}
        items={switcher.items}
        currentId={switcher.currentId}
        isGlobal={isGlobal}
      />
    </header>
  )
}
