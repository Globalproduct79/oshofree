// One toast at a time (GLB §4.8): a new message replaces the current one. Client-side only; the
// server's snapshot is always empty.
export type ToastState = { id: number; message: string } | null

let state: ToastState = null
let seq = 0
const listeners = new Set<() => void>()

export function toast(message: string): void {
  state = { id: ++seq, message }
  listeners.forEach((l) => l())
}

export const subscribeToasts = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

// A Toaster takes the pending toast when it shows it, so a Toaster that mounts later (a layout
// change) finds nothing to replay.
export function takeToast(): ToastState {
  const t = state
  if (t) {
    state = null
    listeners.forEach((l) => l())
  }
  return t
}

export const getToast = (): ToastState => state
export const getServerToast = (): ToastState => null
