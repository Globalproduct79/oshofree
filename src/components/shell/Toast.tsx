'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { getServerToast, getToast, subscribeToasts, takeToast, type ToastState } from './toast-store'

export { toast } from './toast-store'

export const TOAST_MS = 2200

// Mounted once per layout. Takes each toast from the store, shows it for 2.2 s, then fades it out
// (the text stays during the fade so it does not blink empty).
export function Toaster() {
  const pending = useSyncExternalStore(subscribeToasts, getToast, getServerToast)
  const [shown, setShown] = useState<ToastState>(null)
  const [on, setOn] = useState(false)

  useEffect(() => {
    if (!pending) return
    const t = takeToast()
    if (t) {
      setShown(t)
      setOn(true)
    }
  }, [pending])

  useEffect(() => {
    if (!on) return
    const t = setTimeout(() => setOn(false), TOAST_MS)
    return () => clearTimeout(t)
  }, [on, shown])

  return (
    <div className={on ? 'toast on' : 'toast'} role="status" aria-live="polite">
      {shown?.message}
    </div>
  )
}
