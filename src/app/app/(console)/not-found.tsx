import { PageNotHere } from '@/components/shell/PageProblem'
import { SHELL } from '@/lib/copy-shell'

// A workspace console page that is not there (an old link, another workspace's record): said inside the shell, with the way back
// (Prompt 10; it was Next's bare 404 with no way on).
export default function NotFound() {
  return <PageNotHere home="/app" homeLabel={SHELL.problem.toCampaigns} />
}
