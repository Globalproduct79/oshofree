import { signOut } from '@/lib/auth'
import { COPY } from '@/lib/copy'
import { tokens } from '@/lib/tokens'

export function TopBar({ workspaceName, userName }: { workspaceName: string; userName: string }) {
  async function signOutAction() {
    'use server'
    await signOut({ redirectTo: '/sign-in' })
  }
  return (
    <header
      className="flex h-14 items-center justify-between gap-4 border-b pl-16 pr-4 min-[980px]:px-8"
      style={{ backgroundColor: tokens.card, borderColor: tokens.line }}
    >
      <p className="truncate text-sm font-semibold" style={{ color: tokens.ink }}>
        {workspaceName}
      </p>
      <div className="flex items-center gap-3 text-sm">
        <span className="hidden truncate sm:inline" style={{ color: tokens.ink2 }}>
          {userName}
        </span>
        <form action={signOutAction}>
          <button type="submit" className="font-medium" style={{ color: tokens.ink2 }}>
            {COPY.nav.signOut}
          </button>
        </form>
      </div>
    </header>
  )
}
