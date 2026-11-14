import type { ReviewResult } from '@/app/admin/review/actions'
import { toast } from '@/components/shell/toast-store'

// A Review decision's answer as the toast (the outcome, or why nothing happened); true when it went through.
export function say(result: ReviewResult): boolean {
  toast('error' in result ? result.error : result.toast)
  return !('error' in result)
}
