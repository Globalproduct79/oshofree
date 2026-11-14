// The creative picker's decisions, kept apart from the DOM so the node test harness can run them: which keys open
// the file picker, which dropped file is taken, what Retry sends, and where focus goes once an upload settles.

export type PickerState = 'idle' | 'uploading' | 'error'

// Enter or Space on the empty zone opens the file picker, as a button would.
export function zoneKey(e: { key: string; preventDefault: () => void }, open: () => void): void {
  if (e.key !== 'Enter' && e.key !== ' ') return
  e.preventDefault()
  open()
}

// The first file dropped on the zone, if any.
export const droppedFile = (e: { dataTransfer: { files?: ArrayLike<File> | null } | null }): File | undefined =>
  e.dataTransfer?.files?.[0] ?? undefined

// What the picker keeps between renders: the last file it took (Retry sends that file again) and whether focus is
// to move once the picker settles. Replace, Remove and Retry unmount while a file uploads and the empty zone stops
// being a button, so without this a keyboard user is left on <body>.
export class PickerMemory {
  private last: File | null = null
  private refocus = false

  // A file picked, dropped or retried: handed on unless one is already uploading.
  take(file: File | undefined, busy: boolean, onPick: (file: File) => void): void {
    if (!file || busy) return
    this.last = file
    this.refocus = true
    onPick(file)
  }

  retry(busy: boolean, onPick: (file: File) => void): void {
    this.take(this.last ?? undefined, busy, onPick)
  }

  removed(): void {
    this.refocus = true
  }

  // Once the picker is not uploading: Replace when a creative is chosen, else the empty zone; null to leave focus be.
  settle(state: PickerState, chosen: boolean): 'replace' | 'zone' | null {
    if (!this.refocus || state === 'uploading') return null
    this.refocus = false
    return chosen ? 'replace' : 'zone'
  }
}
