import { describe, expect, it, vi } from 'vitest'
import { droppedFile, PickerMemory } from '@/components/og/picker-logic'

// The creative picker's decisions (the component wires these to the DOM; e2e F1 checks the focus lands).

const file = (name = 'card.png') => new File([new Uint8Array(8)], name, { type: 'image/png' })

describe('drag and drop', () => {
  it('takes the first file dropped, and none from a drop that carries no files', () => {
    const a = file('a.png')
    expect(droppedFile({ dataTransfer: { files: [a, file('b.png')] } })).toBe(a)
    expect(droppedFile({ dataTransfer: { files: [] } })).toBeUndefined()
    expect(droppedFile({ dataTransfer: null })).toBeUndefined()
  })

  it('hands a dropped file on, but not while another is uploading', () => {
    const memory = new PickerMemory()
    const onPick = vi.fn()
    const a = file()
    memory.take(droppedFile({ dataTransfer: { files: [a] } }), true, onPick)
    expect(onPick).not.toHaveBeenCalled()
    memory.take(droppedFile({ dataTransfer: { files: [a] } }), false, onPick)
    expect(onPick).toHaveBeenCalledWith(a)
  })
})

describe('Retry', () => {
  it('sends the same file again', () => {
    const memory = new PickerMemory()
    const onPick = vi.fn()
    const a = file()
    memory.take(a, false, onPick)
    memory.retry(false, onPick)
    expect(onPick.mock.calls).toEqual([[a], [a]])
  })

  it('sends the latest file, and nothing before any file was taken', () => {
    const memory = new PickerMemory()
    const onPick = vi.fn()
    memory.retry(false, onPick)
    expect(onPick).not.toHaveBeenCalled()
    const [a, b] = [file('a.png'), file('b.png')]
    memory.take(a, false, onPick)
    memory.take(b, false, onPick)
    memory.retry(false, onPick)
    expect(onPick.mock.calls.at(-1)).toEqual([b])
  })
})

describe('focus once the picker settles', () => {
  it('after an upload lands: Replace (Replace and Remove unmounted while it uploaded)', () => {
    const memory = new PickerMemory()
    memory.take(file(), false, vi.fn())
    expect(memory.settle('uploading', false)).toBeNull()
    expect(memory.settle('uploading', false)).toBeNull()
    expect(memory.settle('idle', true)).toBe('replace')
    // Once only: later renders leave focus where the person put it.
    expect(memory.settle('idle', true)).toBeNull()
  })

  it('after a failed upload: the empty zone, or Replace when a creative is still chosen', () => {
    const empty = new PickerMemory()
    empty.take(file(), false, vi.fn())
    empty.settle('uploading', false)
    expect(empty.settle('error', false)).toBe('zone')

    const replacing = new PickerMemory()
    replacing.take(file(), false, vi.fn())
    replacing.settle('uploading', true)
    expect(replacing.settle('error', true)).toBe('replace')
  })

  it('after Retry: the same, once its upload settles', () => {
    const memory = new PickerMemory()
    memory.take(file(), false, vi.fn())
    memory.settle('error', false)
    memory.retry(false, vi.fn())
    expect(memory.settle('uploading', false)).toBeNull()
    expect(memory.settle('idle', true)).toBe('replace')
  })

  it('after Remove: the empty zone', () => {
    const memory = new PickerMemory()
    memory.removed()
    expect(memory.settle('idle', false)).toBe('zone')
  })

  it('a refused file, never uploaded, keeps focus on the zone it was picked from', () => {
    const memory = new PickerMemory()
    memory.take(file('anim.gif'), false, vi.fn())
    expect(memory.settle('error', false)).toBe('zone')
  })

  it('no pick, no Remove: focus is left alone (a placement switch, a re-render)', () => {
    const memory = new PickerMemory()
    expect(memory.settle('idle', true)).toBeNull()
    expect(memory.settle('idle', false)).toBeNull()
  })
})
