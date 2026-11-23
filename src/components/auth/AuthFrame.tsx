import { COPY } from '@/lib/copy'
import { SHELL } from '@/lib/copy-shell'

// The onboarding column (17 Nov): the brand over whatever card the page puts here — sign-in, sign-up, an invite link,
// the first workspace. The console's own system, so the first screen looks like the rest.
export function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth">
      <div className="lockup">
        <div className="lg" aria-hidden="true">{SHELL.brand.tile}</div>
        <div>
          <b>{SHELL.brand.product}</b>
          <small>{COPY.auth.tagline}</small>
        </div>
      </div>
      {children}
    </main>
  )
}
