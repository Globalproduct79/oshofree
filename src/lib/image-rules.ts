// Shared by the upload route (server) and the drop zone (browser) so both refuse the same files.
export const MAX_IMAGE_BYTES = 2_097_152
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
// What putImage names files: <uuid>.<ext>. Nothing else may reach /uploads or a card's image URL.
export const IMAGE_KEY_RE = /^[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/
// Room for the multipart boundary and part headers around one file.
export const MAX_UPLOAD_BODY_BYTES = MAX_IMAGE_BYTES + 65_536

export function acceptableImage(file: { type: string; size: number }): boolean {
  return (IMAGE_TYPES as readonly string[]).includes(file.type) && file.size > 0 && file.size <= MAX_IMAGE_BYTES
}
