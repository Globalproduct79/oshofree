import { SHELL } from '@/lib/copy-shell'

// What a console or Platform page shows while it loads (Prompt 10, `loading.tsx`): the shell stays, and the page's
// place holds a breadcrumb, a head and three boxes in the design system's grey, pulsing gently (still for anyone who
// asks for less motion). A screen reader hears that the page is loading.
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">{SHELL.loading}</span>
      <div className="crumb">
        <i className="sk sk-crumb" />
      </div>
      <div className="head">
        <div>
          <i className="sk sk-h1" />
          <i className="sk sk-lead" />
        </div>
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="box sk-box" aria-hidden="true">
          <i className="sk sk-h3" />
          <i className="sk sk-line" />
          <i className="sk sk-line sk-short" />
        </div>
      ))}
    </div>
  )
}
