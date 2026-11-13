import Link from 'next/link'
import { Fragment } from 'react'
import { SHELL } from '@/lib/copy-shell'

export type Crumb = { label: string; href?: string }

// Breadcrumb, then h1 + lead with the actions on the right (GLB §2.0, §4.6). Earlier crumbs with an
// href are links; the last one is the darker <span>.
export function PageHead({
  crumb,
  title,
  lead,
  actions,
}: {
  crumb: Crumb[]
  title: React.ReactNode
  lead?: React.ReactNode
  actions?: React.ReactNode
}) {
  const last = crumb.length - 1
  return (
    <>
      <div className="crumb">
        {crumb.map((c, i) => (
          <Fragment key={`${i}-${c.label}`}>
            {i > 0 && SHELL.crumbSep}
            {i === last ? <span>{c.label}</span> : c.href ? <Link href={c.href}>{c.label}</Link> : c.label}
          </Fragment>
        ))}
      </div>
      <div className="head">
        <div>
          <h1>{title}</h1>
          {lead && <p>{lead}</p>}
        </div>
        {actions && <div className="acts">{actions}</div>}
      </div>
    </>
  )
}
