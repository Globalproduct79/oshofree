'use client'

import { Button, LinkButton } from '@/components/og/Button'
import { EmptyState } from '@/components/og/EmptyState'
import { SHELL } from '@/lib/copy-shell'

// What a console or Platform page shows instead of itself (Prompt 10), inside the shell so the sidebar stays a way on:
// a page that is not there (an old link, another workspace's record), or one that failed while it loaded or while an
// action on it ran. Before these, both were Next's bare screens, with no way back but the browser's.
export function PageNotHere({ home, homeLabel }: { home: string; homeLabel: string }) {
  return (
    <EmptyState box title={SHELL.problem.notHere.title}>
      <p>{SHELL.problem.notHere.line}</p>
      <div className="btns">
        <LinkButton variant="primary" href={home}>
          {homeLabel}
        </LinkButton>
      </div>
    </EmptyState>
  )
}

export function PageFailed({ retry, home, homeLabel }: { retry: () => void; home: string; homeLabel: string }) {
  return (
    <EmptyState box title={SHELL.problem.failed.title}>
      <p>{SHELL.problem.failed.line}</p>
      <div className="btns">
        <Button type="button" variant="primary" onClick={retry}>
          {SHELL.problem.failed.retry}
        </Button>
        <LinkButton variant="ghost" href={home}>
          {homeLabel}
        </LinkButton>
      </div>
    </EmptyState>
  )
}
