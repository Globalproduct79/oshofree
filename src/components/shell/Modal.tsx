'use client'

import { useEffect, useId, useRef } from 'react'
import { tabStops, tabTarget } from './focus-trap'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// The prototype's `.modal` with what it lacked (D12): Escape closes, focus stays inside while open
// and goes back to whatever opened it. A click on the backdrop closes it. `narrow` is for a confirm; `sheet` (the
// preview) fills the screen under 720 px.
export function Modal({
  open,
  onClose,
  title,
  narrow,
  sheet,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  narrow?: boolean
  sheet?: boolean
  children: React.ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const box = panel.current
    // Only what Tab can reach: a roving tab list's unselected tabs (tabindex -1) are not stops.
    const focusables = () => tabStops(box ? Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE)) : [])
    ;(focusables()[0] ?? box)?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        close.current()
        return
      }
      if (e.key !== 'Tab') return
      const inside = Boolean(box?.contains(document.activeElement))
      const to = tabTarget(focusables(), document.activeElement, { shift: e.shiftKey, inside })
      if (to.prevent) e.preventDefault()
      to.focus?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [open])

  if (!open) return null
  return (
    <div
      className="modal on"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={narrow ? 'in narrow' : sheet ? 'in sheet' : 'in'} ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <h3 id={titleId}>{title}</h3>
        {children}
      </div>
    </div>
  )
}
