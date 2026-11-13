'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { getServerToast, getToast, subscribeToasts } from './toast-store'

export { toast } from './toast-store'

export const TOAST_MS = 2200

// Mounted once per layout. Shows the latest toast for 2.2 s, then fades it out (the text stays
// during the fade so it does not blink empty).
export function Toaster() {
  const current = useSyncExternalStore(subscribeToasts, getToast, getServerToast)
  const [shownId, setShownId] = useState<number | null>(null)

  useEffect(() => {
    if (!current) return
    setShownId(current.id)
    const t = setTimeout(() => setShownId(null), TOAST_MS)
    return () => clearTimeout(t)
  }, [current])

  const on = current !== null && shownId === current.id
  return (
    <div className={on ? 'toast on' : 'toast'} role="status" aria-live="polite">
      {current?.message}
    </div>
  )
}
