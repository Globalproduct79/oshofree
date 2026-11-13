'use client'

import { useId } from 'react'

// A settings row: label and grey sub-line on the left, the `.sw` switch on the right. The switch
// is named by the label and described by the sub-line.
export function ToggleRow({
  label,
  sub,
  checked,
  disabled,
  onChange,
}: {
  label: React.ReactNode
  sub: React.ReactNode
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  const id = useId()
  return (
    <div className="tog">
      <div>
        <span id={`${id}-l`}>{label}</span>
        <small id={`${id}-s`}>{sub}</small>
      </div>
      <button
        type="button"
        className="sw"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-l`}
        aria-describedby={`${id}-s`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      />
    </div>
  )
}
