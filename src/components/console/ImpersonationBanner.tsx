import { exitWorkspace } from '@/app/admin/advertisers/actions'
import { COPY } from '@/lib/copy'
import { tokens } from '@/lib/tokens'

export function ImpersonationBanner({ workspaceName }: { workspaceName: string }) {
  return (
    <div
      role="status"
      className="flex items-center justify-between gap-4 px-4 py-2 text-sm sm:px-8"
      style={{ backgroundColor: tokens.ink, color: tokens.card }}
    >
      <span>{COPY.banner.impersonating(workspaceName)}</span>
      <form action={exitWorkspace}>
        <button type="submit" className="font-medium underline">
          {COPY.banner.exit}
        </button>
      </form>
    </div>
  )
}
