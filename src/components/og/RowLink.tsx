'use client'

import { useRouter } from 'next/navigation'

// A clickable table row that navigates (a `<tr>` cannot sit inside a link). Enter works too.
export function RowLink({ href, children }: { href: string; children: React.ReactNode }) {
  const router = useRouter()
  return (
    <tr
      className="row"
      data-href={href}
      tabIndex={0}
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') router.push(href)
      }}
    >
      {children}
    </tr>
  )
}
