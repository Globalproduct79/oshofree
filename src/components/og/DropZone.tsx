'use client'

import { useId, useRef } from 'react'
import { COMPONENTS } from '@/lib/copy-components'
import { tokens } from '@/lib/tokens'

// The creative upload (ADV §3): a `label.f` with its hint, then the dashed `.drop`. Empty, a tap
// opens the file picker; with a preview, it shows the image (or the video, muted, when previewKind
// says so) and a tap removes it. `accept` is passed to the hidden file input (images unless the
// caller says otherwise, e.g. 'video/mp4').
export function DropZone({
  label,
  hint,
  zoneTitle,
  zoneHint,
  preview,
  previewKind = 'image',
  accept = 'image/*',
  onPick,
  onRemove,
}: {
  label: React.ReactNode
  hint: React.ReactNode
  zoneTitle: React.ReactNode
  zoneHint: React.ReactNode
  preview?: string | null
  previewKind?: 'image' | 'video'
  accept?: string
  onPick: (file: File) => void
  onRemove: () => void
}) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const activate = () => (preview ? onRemove() : input.current?.click())
  return (
    <>
      <label className="f" htmlFor={id}>
        {label} <small>{hint}</small>
      </label>
      <div
        className="drop"
        style={{ marginTop: 6 }}
        role="button"
        tabIndex={0}
        onClick={activate}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            activate()
          }
        }}
      >
        {preview ? (
          <>
            {previewKind === 'video' ? (
              <video src={preview} muted playsInline preload="metadata" />
            ) : (
              // A local object URL or an uploaded creative; next/image adds nothing here.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" />
            )}
            {COMPONENTS.drop.remove}
          </>
        ) : (
          <>
            <b style={{ color: tokens.ink }}>{zoneTitle}</b>
            <br />
            {zoneHint}
          </>
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
          if (file) onPick(file)
        }}
      />
    </>
  )
}
