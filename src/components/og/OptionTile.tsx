'use client'

import type { ComponentProps } from 'react'
import { COMPONENTS } from '@/lib/copy-components'

// A pressable placement tile: title, description, big price, and the amber "inventory TBC"
// badge when `soon`. Native button props (onClick, disabled…) are forwarded.
export function OptionTile({
  pressed,
  title,
  desc,
  big,
  soon,
  ...props
}: Omit<ComponentProps<'button'>, 'title'> & {
  pressed: boolean
  title: React.ReactNode
  desc: React.ReactNode
  big: React.ReactNode
  soon?: boolean
}) {
  return (
    <button type="button" className="opt" aria-pressed={pressed} {...props}>
      {soon && <span className="soon">{COMPONENTS.option.soon}</span>}
      <b>{title}</b>
      <span>{desc}</span>
      <span className="big">{big}</span>
    </button>
  )
}
