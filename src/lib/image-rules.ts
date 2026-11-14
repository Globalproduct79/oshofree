// Shared by the upload route (server) and the creative picker (browser) so both refuse the same files.
// Caps by kind: a card or featured image 2 MB, a splash image 4 MB (it fills the screen), an MP4 25 MB.
export const MAX_IMAGE_BYTES = 2_097_152
export const MAX_SPLASH_BYTES = 4_194_304
export const MAX_VIDEO_BYTES = 26_214_400
export type UploadKind = 'image' | 'splash' | 'video'
export const UPLOAD_CAP: Record<UploadKind, number> = { image: MAX_IMAGE_BYTES, splash: MAX_SPLASH_BYTES, video: MAX_VIDEO_BYTES }
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
// What putImage names files: <uuid>.<ext>. Nothing else may reach /uploads or a card's image URL.
export const IMAGE_KEY_RE = /^[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/
// What putCreative names an MP4: <uuid>.mp4. Video keys are checked against this, never IMAGE_KEY_RE.
export const VIDEO_KEY_RE = /^[0-9a-f-]{36}\.mp4$/
// Any key putCreative may have made, image or video: what /uploads will serve.
export const CREATIVE_KEY_RE = /^[0-9a-f-]{36}\.(jpg|jpeg|png|webp|mp4)$/
export const VIDEO_TYPES = ['video/mp4'] as const
// The largest cap, plus room for the multipart boundary and part headers (and the placement field) around one file.
export const MAX_UPLOAD_BODY_BYTES = Math.max(...Object.values(UPLOAD_CAP)) + 65_536

// An MP4 is video wherever it goes. An image is a splash only when the caller's placement says so, and that
// only picks the image cap: the type itself is always judged from the bytes.
export function uploadKind(type: string, placement?: unknown): UploadKind {
  if ((VIDEO_TYPES as readonly string[]).includes(type)) return 'video'
  return placement === 'splash' ? 'splash' : 'image'
}

export function acceptableImage(file: { type: string; size: number }): boolean {
  return (IMAGE_TYPES as readonly string[]).includes(file.type) && file.size > 0 && file.size <= MAX_IMAGE_BYTES
}

// Where /uploads serves a stored creative. No file system here: the offers feed builds these under tsx too.
export function creativeUrl(key: string): string {
  return `/uploads/${key}`
}
export const imageUrl = creativeUrl
