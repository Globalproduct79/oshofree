'use client'

import type { ComponentProps } from 'react'
import { COMPONENTS } from '@/lib/copy-components'

// A pressable placement tile: title, description, big price, and the amber "inventory TBC"
// badge when `soon`. The badge sits on the tile's top edge, clear of the title, and comes after the title in
// the markup, so the tile's name starts with its placement. Native button props (onClick, disabled…) are forwarded.
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
      <b>{title}</b>
      {soon && <span className="soon">{COMPONENTS.option.soon}</span>}
      <span>{desc}</span>
      <span className="big">{big}</span>
    </button>
  )
}
