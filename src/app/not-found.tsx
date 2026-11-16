import { PageNotHere } from '@/components/shell/PageProblem'
import { SHELL } from '@/lib/copy-shell'

// An address that matches no page (Prompt 10 fix round): the product's own "This page isn't here", in the design
// system's box on the plain page (there is no shell outside the console), with the way to the start: / sends a
// signed-in person to their workspace and anyone else to sign in. Before, Next's bare 404.
export default function NotFound() {
  return (
    <main className="wrap">
      <PageNotHere home="/" homeLabel={SHELL.problem.toStart} />
    </main>
  )
}
