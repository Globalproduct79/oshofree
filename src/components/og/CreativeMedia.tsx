import type { ReactNode } from 'react'
import { coverStyle } from './cover'

type Props = {
  image: string | null | undefined
  video: string | null | undefined
  // What a screen reader calls the image and the video.
  labels: { image: string; video: string }
  // A cover: the box takes the image, or this tile colour, as its background, and a video fills it.
  color?: string
  className?: string
  // A video that can be played (the campaign page, the form): its controls, sound on. Otherwise a still first frame.
  controls?: boolean
  // What stands in for no creative: the initials over the cover's colour, or a line saying there is none.
  fallback?: ReactNode
  // A cover's overlays (the status pill, 18+, the placement).
  children?: ReactNode
}

// A creative wherever it is shown: the image, the video opened at its first frame (#t=0.1 makes Safari draw it), or the
// tile colour. Inline (no `color`), the file at its own size; as a cover (`color`), the box the cards and the review
// queue draw, with the image as its background (the prototype's cover()) and a video filling it.
export function CreativeMedia({ image, video, labels, color, className, controls, fallback, children }: Props) {
  const clip =
    video &&
    (controls ? (
      <video src={`${video}#t=0.1`} aria-label={labels.video} controls playsInline preload="metadata" className={color === undefined ? className : undefined} />
    ) : (
      <video src={`${video}#t=0.1`} aria-label={labels.video} muted playsInline preload="metadata" className={color === undefined ? className : undefined} />
    ))
  if (color !== undefined) {
    return (
      <div className={className} style={coverStyle(video ? null : image, color)}>
        {clip || (!image && fallback)}
        {children}
      </div>
    )
  }
  if (clip) return clip
  // An uploaded creative (or the picker's local preview); next/image adds nothing here.
  // eslint-disable-next-line @next/next/no-img-element
  if (image) return <img src={image} alt={labels.image} className={className} />
  return <>{fallback}</>
}
