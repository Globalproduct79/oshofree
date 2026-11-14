import { describe, expect, it } from 'vitest'
import { tabStops, tabTarget } from '@/components/shell/focus-trap'

// What the dialog's querySelectorAll hands over, in document order: only the tab order matters here.
type El = { name: string; tabIndex: number }
const el = (name: string, tabIndex = 0): El => ({ name, tabIndex })

// The preview opened on Landing page for a Wall card: the roving tabs before it, the panel, the phone's video, Close.
const wallCard = el('Wall card', -1)
const landing = el('Landing page', 0)
const share = el('Share', -1)
const panel = el('panel', 0)
const close = el('Close', 0)
const dialog = [wallCard, landing, share, panel, close]

describe('tabStops', () => {
  it('keeps only what Tab can reach: a roving tab with tabindex -1 is not a stop', () => {
    expect(tabStops(dialog)).toEqual([landing, panel, close])
    expect(tabStops([el('a'), el('b', -1), el('c', 2)]).map((e) => e.name)).toEqual(['a', 'c'])
    expect(tabStops([])).toEqual([])
  })
})

describe('tabTarget', () => {
  const stops = tabStops(dialog)

  it('Shift+Tab from the selected tab (second in the dialog, first stop) wraps to Close, never out of the dialog', () => {
    expect(tabTarget(stops, landing, { shift: true, inside: true })).toEqual({ prevent: true, focus: close })
  })

  it('Tab from the last stop wraps to the first', () => {
    expect(tabTarget(stops, close, { shift: false, inside: true })).toEqual({ prevent: true, focus: landing })
  })

  it('leaves a move between stops to the browser', () => {
    expect(tabTarget(stops, panel, { shift: false, inside: true })).toEqual({ prevent: false, focus: null })
    expect(tabTarget(stops, panel, { shift: true, inside: true })).toEqual({ prevent: false, focus: null })
  })

  it('brings focus that has left the dialog back in, at the end the key points to', () => {
    expect(tabTarget(stops, null, { shift: false, inside: false })).toEqual({ prevent: true, focus: landing })
    expect(tabTarget(stops, null, { shift: true, inside: false })).toEqual({ prevent: true, focus: close })
  })

  it('holds focus still in a dialog with nothing to tab to', () => {
    expect(tabTarget([], null, { shift: false, inside: true })).toEqual({ prevent: true, focus: null })
  })
})
