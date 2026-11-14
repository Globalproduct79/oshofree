'use client'

import { Button } from '@/components/og'

export function PrintButton({ label }: { label: string }) {
  return (
    <Button variant="ghost" size="s" className="no-print" onClick={() => window.print()}>
      {label}
    </Button>
  )
}
