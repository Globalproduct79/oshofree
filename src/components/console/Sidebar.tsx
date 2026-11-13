'use client'

import { Menu, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { COPY } from '@/lib/copy'
import { tokens } from '@/lib/tokens'

const groups = [
  { label: COPY.nav.groups.campaigns, items: [
    { label: COPY.nav.items.campaigns, href: '/app' },
    { label: COPY.nav.items.newCampaign, href: '/app/campaigns/new' },
  ] },
  { label: COPY.nav.groups.growth, items: [{ label: COPY.nav.items.sharing, href: '/app/sharing' }] },
  { label: COPY.nav.groups.organisation, items: [{ label: COPY.nav.items.workspace, href: '/app/workspace' }] },
]

function isActive(pathname: string, href: string) {
  return href === '/app' ? pathname === '/app' : pathname === href || pathname.startsWith(`${href}/`)
}

export function Sidebar({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        aria-label={COPY.nav.menu}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="fixed left-3 top-2 z-40 flex size-10 items-center justify-center rounded-lg min-[980px]:hidden"
        style={{ color: tokens.ink }}
      >
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-[var(--sidebar-w)] flex-col gap-6 overflow-y-auto border-r px-4 pb-6 pt-16 transition-transform min-[980px]:translate-x-0 min-[980px]:pt-6 ${open ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ ['--sidebar-w' as string]: tokens.sidebar, backgroundColor: tokens.card, borderColor: tokens.line }}
      >
        <p className="px-3 text-lg font-bold" style={{ color: tokens.ink }}>
          OshoFree
        </p>
        <nav className="flex flex-col gap-5">
          {groups.map((g) => (
            <div key={g.label} className="flex flex-col gap-1">
              <p className="px-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: tokens.ink3 }}>
                {g.label}
              </p>
              {g.items.map((i) => {
                const active = isActive(pathname, i.href)
                return (
                  <Link
                    key={i.href}
                    href={i.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className="rounded-lg px-3 py-2 text-sm font-medium"
                    style={{
                      backgroundColor: active ? tokens.accent : 'transparent',
                      color: active ? tokens.card : tokens.ink2,
                    }}
                  >
                    {i.label}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>
        <div className="mt-auto">{children}</div>
      </aside>
    </>
  )
}
