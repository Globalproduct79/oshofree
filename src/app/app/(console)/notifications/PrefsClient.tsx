'use client'

import type { NotificationKind } from '@prisma/client'
import { useState, useTransition } from 'react'
import { ToggleRow } from '@/components/og'
import { toast } from '@/components/shell/toast-store'
import { NOTIFICATIONS_PAGE } from '@/lib/copy-notifications-page'
import { setPrefAction } from './actions'

// Saves one flip. A save says nothing (the switch is the answer); one that fails puts the switch back and says it did
// not save (Prompt 10: it used to go back without a word).
export async function savePref(save: () => Promise<unknown>, revert: () => void): Promise<void> {
  try {
    await save()
  } catch {
    revert()
    toast(NOTIFICATIONS_PAGE.saveFailed)
  }
}

// Five switches, one per kind (ADV §11). A flip saves at once with no toast; Manager and Viewer
// see them disabled.
export function PrefsClient({ initial, canEdit }: { initial: Partial<Record<NotificationKind, boolean>>; canEdit: boolean }) {
  const [values, setValues] = useState(initial)
  const [, startTransition] = useTransition()
  const flip = (kind: NotificationKind, enabled: boolean) => {
    setValues((v) => ({ ...v, [kind]: enabled }))
    startTransition(() =>
      savePref(
        () => setPrefAction(kind, enabled),
        () => setValues((v) => ({ ...v, [kind]: !enabled })),
      ),
    )
  }
  return (
    <>
      {NOTIFICATIONS_PAGE.prefs.map((p) => (
        <ToggleRow key={p.kind} label={p.label} sub={p.sub} checked={values[p.kind] ?? false} disabled={!canEdit} onChange={(c) => flip(p.kind, c)} />
      ))}
    </>
  )
}
