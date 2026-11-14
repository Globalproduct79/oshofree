'use client'

import { useEffect, useRef } from 'react'
import { toast } from './toast-store'

// A toast for a page a redirect brought you to (the workspace's home after joining from an invite): shown once,
// then the query that asked for it leaves the address bar, so a reload or a copied URL doesn't say it again.
export function ArrivalToast({ message }: { message: string }) {
  const said = useRef(false)
  useEffect(() => {
    if (said.current) return
    said.current = true
    toast(message)
    window.history.replaceState(null, '', window.location.pathname)
  }, [message])
  return null
}
