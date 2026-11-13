import type { CSSProperties } from 'react'

// A URL as a CSS url() string, with the characters that would end it escaped.
export const cssUrl = (u: string) => `url("${u.replace(/["\\\n\r]/g, (c) => encodeURIComponent(c))}")`

// The prototype's cover(): the creative as a background image, otherwise the tile colour (the
// caller adds the initials).
export const coverStyle = (imageUrl: string | null | undefined, color: string): CSSProperties =>
  imageUrl ? { backgroundImage: cssUrl(imageUrl) } : { background: color }
