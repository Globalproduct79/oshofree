'use client'

import { ImageUp, X } from 'lucide-react'
import Image from 'next/image'
import { useState } from 'react'
import { useFormContext } from 'react-hook-form'
import { COPY } from '@/lib/copy'
import { acceptableImage, IMAGE_TYPES } from '@/lib/image-rules'
import { tokens } from '@/lib/tokens'
import { Message, useField } from './fields'
import type { FormValues } from './values'

const C = COPY.campaignForm

export function CreativePicker({ imageUrl, onImage }: { imageUrl: string | null; onImage: (url: string | null) => void }) {
  const { register, setValue } = useFormContext<FormValues>()
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string>()
  const colour = useField('tileColor')

  function setKey(key: string | undefined) {
    setValue('creativeImageKey', key, { shouldDirty: true, shouldValidate: true })
  }

  async function upload(file: File | undefined) {
    if (!file) return
    setError(undefined)
    if (!acceptableImage(file)) return setError(C.image.bad)
    setUploading(true)
    try {
      const body = new FormData()
      body.set('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body })
      const json: { key?: string; url?: string } | null = await res.json().catch(() => null)
      if (!res.ok || !json?.key || !json.url) return setError(res.status === 400 || res.status === 413 ? C.image.bad : C.image.failed)
      setKey(json.key)
      onImage(json.url)
    } catch {
      setError(C.image.failed)
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <div className="flex flex-col gap-1.5 sm:col-span-full">
        <span className="text-sm font-medium" style={{ color: tokens.ink }}>{C.image.label}</span>
        <label
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            upload(e.dataTransfer.files[0])
          }}
          className="flex cursor-pointer items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-5 text-sm has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
          style={{ borderColor: dragging ? tokens.accent : tokens.line, color: tokens.ink2 }}
        >
          {imageUrl ? (
            <Image src={imageUrl} alt="" width={64} height={36} unoptimized className="h-9 w-16 rounded-md object-cover" />
          ) : (
            <ImageUp className="size-5" aria-hidden />
          )}
          <span>{uploading ? C.image.uploading : imageUrl ? C.image.replace : C.image.drop}</span>
          <input
            type="file"
            accept={IMAGE_TYPES.join(',')}
            className="sr-only"
            aria-describedby="cf-image-msg"
            disabled={uploading}
            onChange={(e) => {
              upload(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
        <div className="flex items-start justify-between gap-3">
          <Message id="cf-image-msg" error={error} hint={C.image.hint} />
          {imageUrl && (
            <button
              type="button"
              onClick={() => {
                setKey(undefined)
                onImage(null)
              }}
              className="flex shrink-0 items-center gap-1 text-xs font-medium"
              style={{ color: tokens.ink2 }}
            >
              <X className="size-3.5" aria-hidden />
              {C.image.remove}
            </button>
          )}
        </div>
      </div>
      <fieldset className="flex flex-col gap-1.5 sm:col-span-full" aria-describedby={`${colour.id}-msg`}>
        <legend className="mb-1.5 text-sm font-medium" style={{ color: tokens.ink }}>{C.tileColor.label}</legend>
        <div className="flex flex-wrap gap-2.5">
          {tokens.tileColors.map((c, i) => (
            <label key={c} className="cursor-pointer">
              <input type="radio" value={c} aria-label={C.tileColor.swatch(i + 1)} className="peer sr-only" {...register('tileColor')} />
              <span
                className="block size-7 rounded-full ring-offset-2 peer-checked:ring-2 peer-focus-visible:ring-2"
                style={{ backgroundColor: c, color: tokens.ink }}
              />
            </label>
          ))}
        </div>
        <Message id={`${colour.id}-msg`} error={colour.error} hint={C.tileColor.hint} />
      </fieldset>
    </>
  )
}
