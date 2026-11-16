'use client'

import { PageFailed } from '@/components/shell/PageProblem'
import { SHELL } from '@/lib/copy-shell'

// A Platform page that failed while it loaded, or while an action on it ran: said inside the shell, with Try again and the
// way back (Prompt 10; it was Next's bare "Application error" screen).
export default function Failed({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <PageFailed retry={reset} home="/admin/review" homeLabel={SHELL.problem.toReview} />
}
