'use client'

import { COMPONENTS } from '@/lib/copy-components'

// The tile-colour circles; the pressed one gets the ink ring.
export function Swatches({
  colors,
  value,
  onChange,
}: {
  colors: readonly string[]
  value: string
  onChange: (color: string) => void
}) {
  return (
    <div className="swatches">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={COMPONENTS.swatch}
          aria-pressed={c === value}
          style={{ background: c }}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  )
}
