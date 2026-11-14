// The search palette's open signal: the topbar button calls openPalette(), the Palette (mounted once
// per layout) subscribes. Client-side only.
const listeners = new Set<() => void>()

export const openPalette = (): void => listeners.forEach((l) => l())

export const subscribePalette = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
