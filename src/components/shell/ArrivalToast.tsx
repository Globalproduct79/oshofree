'use client'

import { useEffect, useRef } from 'react'
import { toast } from './toast-store'

type TabStorage = Pick<Storage, 'getItem' | 'setItem'>

// True the first time this tab sees `key` (a flag kept in sessionStorage); true every time when storage is refused
// (private mode, blocked site data), since a repeated toast beats a missing one.
export function firstTime(key: string, storage: () => TabStorage = () => window.sessionStorage): boolean {
  try {
    const s = storage()
    if (s.getItem(key)) return false
    s.setItem(key, '1')
  } catch {
    // Storage unavailable: say it.
  }
  return true
}

// The address without `param`, keeping the rest of the query and the hash.
export function withoutParam(href: string, param: string): string {
  const url = new URL(href)
  url.searchParams.delete(param)
  return url.pathname + url.search + url.hash
}

// A toast for a page a redirect brought you to (the workspace's home after joining from an invite, `?joined=`): said
// once per tab for `onceKey`, so going back or forward to the cached page stays quiet, and `param` leaves the
// address bar, so a reload or a copied URL doesn't ask for it again.
export function ArrivalToast({ message, param, onceKey }: { message: string; param: string; onceKey: string }) {
  const said = useRef(false)
  useEffect(() => {
    if (said.current) return
    said.current = true
    if (firstTime(onceKey)) toast(message)
    window.history.replaceState(null, '', withoutParam(window.location.href, param))
  }, [message, param, onceKey])
  return null
}
