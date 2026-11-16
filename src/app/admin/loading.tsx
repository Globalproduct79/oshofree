import { PageSkeleton } from '@/components/shell/PageSkeleton'

// While a Platform page loads (Prompt 10): the shell stays drawn and the page's place shows the skeleton.
export default function Loading() {
  return <PageSkeleton />
}
