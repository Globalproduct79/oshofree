'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useSyncExternalStore } from 'react'
import { DemoPill } from '@/components/og/DemoPill'
import { DEMO } from '@/lib/copy-demo'
import { isCurrent, type NavGroup } from '@/lib/nav'
import { NavIcon } from './Icons'

// Below 980 px the sidebar is a drawer (spec §6.11): the topbar's menu button opens it.
let drawerOpen = false
const listeners = new Set<() => void>()
export function setDrawer(open: boolean): void {
  if (drawerOpen === open) return
  drawerOpen = open
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
export const useDrawer = () => useSyncExternalStore(subscribe, () => drawerOpen, () => false)

export const SIDEBAR_ID = 'side'

// `demo`: a workspace the seed made (Prompt 9) — the Demo pill beside its name and the demo line in the footer.
// `tile`: the tile's colour (a workspace's own, from tileColor); unset, the console's orange (Platform).
export type SidebarBrand = { initials: string; name: string; sub: string; tile?: string; demo?: boolean }

export function Sidebar({
  brand,
  groups,
  footer,
  children,
}: {
  brand: SidebarBrand
  groups: NavGroup[]
  footer: React.ReactNode
  children?: React.ReactNode
}) {
  const pathname = usePathname()
  const open = useDrawer()

  useEffect(() => setDrawer(false), [pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      {open && (
        <div aria-hidden="true" className="fixed inset-0 z-[29] min-[981px]:hidden" onClick={() => setDrawer(false)} />
      )}
      <aside className="side" id={SIDEBAR_ID} data-open={open}>
        <div className="brand">
          <div className="lg" style={brand.tile ? { background: brand.tile } : undefined}>
            {brand.initials}
          </div>
          <div>
            <b>
              {brand.name}
              {brand.demo && <> <DemoPill /></>}
            </b>
            <small>{brand.sub}</small>
          </div>
        </div>
        <nav>
          {groups.map((g) => (
            <div key={g.label}>
              <div className="grp">{g.label}</div>
              {g.items.map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  aria-current={isCurrent(pathname, i.href) ? 'page' : undefined}
                  onClick={() => setDrawer(false)}
                >
                  <NavIcon name={i.icon} />
                  {i.label}
                  {i.count !== undefined && <span className="cnt">{i.count}</span>}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="mt-auto">
          {children && <div className="px-[10px] pt-[14px]">{children}</div>}
          <div className="foot">
            {brand.demo && <span className="dmf">{DEMO.footer}</span>}
            {footer}
          </div>
        </div>
      </aside>
    </>
  )
}
