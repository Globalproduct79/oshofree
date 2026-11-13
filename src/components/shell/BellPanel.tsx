'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { markReadAction } from '@/app/app/(console)/notifications/actions'
import { SHELL } from '@/lib/copy-shell'
import { tokens } from '@/lib/tokens'

export type BellItem = { id: string; title: string; detail: string | null; href: string | null; age: string }

// A full-width button inside each `.notif` row, so the whole padded row is the click target.
export const ROW_BUTTON =
  '-mx-3 -my-2.5 w-[calc(100%+24px)] rounded-[9px] border-0 bg-transparent px-3 py-2.5 text-left text-inherit'

// The bell's dropdown (GLB §4.4). Unlike the prototype (D11), a click marks the item read and
// follows its link.
export function BellPanel({
  id,
  open,
  items,
  onClose,
}: {
  id: string
  open: boolean
  items: BellItem[]
  onClose: () => void
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  if (!open) return null

  const follow = (item: BellItem) =>
    startTransition(async () => {
      await markReadAction(item.id)
      onClose()
      if (item.href) router.push(item.href)
    })

  return (
    <div className="notif on" id={id} data-pop="bell" role="region" aria-label={SHELL.bell.label}>
      <div className="h">{SHELL.bell.title}</div>
      {items.length === 0 ? (
        <div style={{ color: tokens.ink3 }}>{SHELL.bell.empty}</div>
      ) : (
        items.map((item) => (
          <div key={item.id}>
            <button type="button" className={`${ROW_BUTTON} block`} onClick={() => follow(item)}>
              <b>{item.title}</b>
              <small>{SHELL.bell.line(item.detail, item.age)}</small>
            </button>
          </div>
        ))
      )}
    </div>
  )
}
