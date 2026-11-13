// Shared by the upload route (server) and the drop zone (browser) so both refuse the same files.
export const MAX_IMAGE_BYTES = 2_097_152
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export function acceptableImage(file: { type: string; size: number }): boolean {
  return (IMAGE_TYPES as readonly string[]).includes(file.type) && file.size > 0 && file.size <= MAX_IMAGE_BYTES
}
