'use client'

import { useState, useTransition } from 'react'
import { moreActivityAction } from '@/app/app/(console)/campaigns/actions'
import { btnClass } from '@/components/og'
import { lineAnchor, type ActivityLine } from '@/lib/activity-keys'
import { ACTIVITY as A } from '@/lib/copy-activity'

// Recent activity's lines and its Show more. Show more fetches the 30 lines below the last one (a keyset cursor, so
// the page never re-reads what it shows) and adds them under it: the scroll stays and a lit line stays lit. Without
// script, or opened in a new tab, it is a link to that next page (?before=), keeping ?line=.
export function ActivityList({
  campaignId,
  lines: first,
  next: firstNext,
  line,
}: {
  campaignId: string
  lines: readonly ActivityLine[]
  next: string | null
  line: string | null
}) {
  const [lines, setLines] = useState(first)
  const [next, setNext] = useState(firstNext)
  const [failed, setFailed] = useState(false)
  const [pending, start] = useTransition()
  const href = next && `/app/campaigns/${campaignId}?${line ? `line=${encodeURIComponent(line)}&` : ''}before=${encodeURIComponent(next)}`
  return (
    <>
      <ul className="hist">
        {lines.map((l) => {
          const on = l.key === line
          return (
            <li key={l.key} id={lineAnchor(l.key)} title={l.title} className={on ? 'on' : undefined} aria-current={on ? 'true' : undefined}>
              {l.text}
            </li>
          )
        })}
      </ul>
      {failed && (
        <p className="hist-none" role="status">
          {A.moreFailed}
        </p>
      )}
      {next && href && (
        <div className="btns">
          <a
            className={btnClass({ variant: 'ghost', size: 's' })}
            href={href}
            aria-disabled={pending || undefined}
            onClick={(e) => {
              // A new tab or window gets the next page as a page.
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
              e.preventDefault()
              if (pending) return
              start(async () => {
                const res = await moreActivityAction(campaignId, next).catch(() => null)
                if (!res || 'error' in res) return setFailed(true)
                setFailed(false)
                setLines((shown) => [...shown, ...res.lines])
                setNext(res.next)
              })
            }}
          >
            {A.more}
          </a>
        </div>
      )}
    </>
  )
}
