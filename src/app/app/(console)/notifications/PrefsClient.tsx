'use client'

import type { NotificationKind } from '@prisma/client'
import { useState, useTransition } from 'react'
import { ToggleRow } from '@/components/og'
import { NOTIFICATIONS_PAGE } from '@/lib/copy-notifications-page'
import { setPrefAction } from './actions'

// Five switches, one per kind (ADV §11). A flip saves at once with no toast; Manager and Viewer
// see them disabled.
export function PrefsClient({ initial, canEdit }: { initial: Partial<Record<NotificationKind, boolean>>; canEdit: boolean }) {
  const [values, setValues] = useState(initial)
  const [, startTransition] = useTransition()
  const flip = (kind: NotificationKind, enabled: boolean) => {
    setValues((v) => ({ ...v, [kind]: enabled }))
    startTransition(async () => {
      try {
        await setPrefAction(kind, enabled)
      } catch {
        setValues((v) => ({ ...v, [kind]: !enabled }))
      }
    })
  }
  return (
    <>
      {NOTIFICATIONS_PAGE.prefs.map((p) => (
        <ToggleRow key={p.kind} label={p.label} sub={p.sub} checked={values[p.kind] ?? false} disabled={!canEdit} onChange={(c) => flip(p.kind, c)} />
      ))}
    </>
  )
}
