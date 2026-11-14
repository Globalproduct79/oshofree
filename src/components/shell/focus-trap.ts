// The Modal's focus trap, as plain logic (no DOM needed to test it).

// What Tab can reach among the dialog's focusable elements: a roving tab list keeps its unselected tabs at
// tabindex -1, and a trap that counted them would let Shift+Tab from the selected tab leave the dialog.
export function tabStops<T extends { tabIndex: number }>(elements: readonly T[]): T[] {
  return elements.filter((e) => e.tabIndex >= 0)
}

// Where a Tab press goes: from the last stop (or Shift+Tab from the first) round to the other end, and from outside
// the dialog back in at the end the key points to; between stops the browser moves it. With no stop, focus stays.
export function tabTarget<T>(
  stops: readonly T[],
  active: unknown,
  { shift, inside }: { shift: boolean; inside: boolean },
): { prevent: boolean; focus: T | null } {
  if (stops.length === 0) return { prevent: true, focus: null }
  const first = stops[0]
  const last = stops[stops.length - 1]
  if (shift && (active === first || !inside)) return { prevent: true, focus: last }
  if (!shift && (active === last || !inside)) return { prevent: true, focus: first }
  return { prevent: false, focus: null }
}
