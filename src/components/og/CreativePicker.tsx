'use client'

import { useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { COMPONENTS } from '@/lib/copy-components'
import { tokens } from '@/lib/tokens'
import { Button } from './Button'
import { CreativeMedia } from './CreativeMedia'
import { droppedFile, PickerMemory, zoneKey } from './picker-logic'

const C = COMPONENTS.drop

export type PickerMedia = { url: string; kind: 'image' | 'video' }
// Where the picker is: resting (with a note, say why a placement switch took the creative off), sending a file
// (its own preview while it goes), or refused (Retry only when trying the same file again could work).
export type PickerStatus =
  | { state: 'idle'; note?: string }
  | { state: 'uploading'; percent: number; preview?: PickerMedia }
  | { state: 'error'; message: string; retry: boolean }

type Props = {
  label: ReactNode
  hint: ReactNode
  zoneTitle: ReactNode
  zoneHint: ReactNode
  // The file input's accept: only the types the placement takes.
  accept?: string
  chosen?: PickerMedia | null
  status?: PickerStatus
  // What a chosen creative is shown in instead of the bare media (a splash's phone).
  frame?: ReactNode
  // Buttons after Replace and Remove (a splash's View full size).
  actions?: ReactNode
  // A file picked, dropped, or sent again by Retry (the picker keeps the last one).
  onPick: (file: File) => void
  onRemove: () => void
}

// The image as it is, or the video with the browser's own controls, opened at its first frame. `still` is the preview
// of a file still uploading: no controls, nothing to play yet.
function Media({ media, still }: { media: PickerMedia; still?: boolean }) {
  return (
    <CreativeMedia
      image={media.kind === 'image' ? media.url : null}
      video={media.kind === 'video' ? media.url : null}
      labels={C.chosen}
      controls={!still}
    />
  )
}

// The creative upload (ADV §3): a `label.f` with its hint, then the dashed `.drop`. Empty, the zone is a button
// (click, Enter or Space opens the file picker) and a file can be dropped on it. While a file uploads the zone
// shows it with a progress bar; once chosen, the creative itself (an image, a video with controls, or the
// caller's frame) with Replace and Remove under it. The live region says "Uploading…" once and then the outcome
// once; the percentage is on the progress bar (and shown beside the words, hidden from screen readers). When the
// picker settles after a pick, a Retry or a Remove, focus goes to Replace, or to the empty zone.
export function CreativePicker({
  label,
  hint,
  zoneTitle,
  zoneHint,
  accept = 'image/*',
  chosen = null,
  status = { state: 'idle' },
  frame,
  actions,
  onPick,
  onRemove,
}: Props) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const zone = useRef<HTMLDivElement>(null)
  const replace = useRef<HTMLButtonElement>(null)
  const [over, setOver] = useState(false)
  const [memory] = useState(() => new PickerMemory())

  const busy = status.state === 'uploading'
  const empty = !busy && !chosen
  useEffect(() => {
    const target = memory.settle(status.state, chosen !== null)
    if (target) (target === 'replace' ? replace.current : zone.current)?.focus()
  }, [memory, status, chosen])

  const open = () => {
    if (!busy) input.current?.click()
  }
  const take = (file: File | undefined) => memory.take(file, busy, onPick)
  const drag = (e: DragEvent, on: boolean) => {
    e.preventDefault()
    if (!busy) setOver(on)
  }
  const message = busy ? C.uploading : status.state === 'error' ? status.message : (status.note ?? '')

  return (
    <>
      <label className="f" htmlFor={id}>
        {label} <small>{hint}</small>
      </label>
      <div
        ref={zone}
        className="drop"
        data-state={busy ? 'uploading' : chosen ? 'chosen' : 'idle'}
        data-over={over || undefined}
        aria-busy={busy || undefined}
        {...(empty && {
          role: 'button',
          tabIndex: 0,
          onClick: open,
          onKeyDown: (e: React.KeyboardEvent) => zoneKey(e, open),
        })}
        onDragOver={(e) => drag(e, true)}
        onDragLeave={(e) => {
          // Moving over the zone's own image or text is not leaving it.
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) drag(e, false)
        }}
        onDrop={(e) => {
          drag(e, false)
          take(droppedFile(e))
        }}
      >
        {busy ? (
          <>
            {status.preview && <Media media={status.preview} still />}
            <div
              className="bar"
              role="progressbar"
              aria-label={C.uploading}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={status.percent}
            >
              <i style={{ width: `${status.percent}%` }} />
            </div>
          </>
        ) : chosen ? (
          (frame ?? <Media media={chosen} />)
        ) : (
          <>
            <b style={{ color: tokens.ink }}>{zoneTitle}</b>
            <br />
            {zoneHint}
          </>
        )}
      </div>
      {chosen && !busy && (
        <div className="btns dacts">
          <Button ref={replace} size="s" type="button" onClick={open}>
            {C.replace}
          </Button>
          <Button
            variant="ghost"
            size="s"
            type="button"
            onClick={() => {
              memory.removed()
              onRemove()
            }}
          >
            {C.remove}
          </Button>
          {actions}
        </div>
      )}
      <div className={status.state === 'error' ? 'dmsg bad' : 'dmsg'}>
        <span aria-live="polite">{message}</span>
        {busy && <span aria-hidden="true">{C.percent(status.percent)}</span>}
        {status.state === 'error' && status.retry && (
          <Button size="s" type="button" onClick={() => memory.retry(busy, onPick)}>
            {C.retry}
          </Button>
        )}
      </div>
      <input
        id={id}
        ref={input}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          take(file)
        }}
      />
    </>
  )
}
