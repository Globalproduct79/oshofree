'use client'

import { useEffect } from 'react'

// Brings the element with this id to the middle of the screen once the page is drawn: the activity line a link from
// Global's held rewards asked for, which may sit pages down the list.
export function ScrollHere({ id }: { id: string }) {
  useEffect(() => {
    document.getElementById(id)?.scrollIntoView({ block: 'center' })
  }, [id])
  return null
}
