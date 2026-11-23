import Link from 'next/link'
import { INVITE_PAGE } from '@/lib/copy-people'

// A link that can no longer be accepted (accepted, revoked, expired, or retired by Resend): it says so and to ask
// for a new one. The invite page shows it; sign-in and sign-up, when such a link opened them, add their own way on
// without the invite (`way`).
export function InvalidInvite({ way }: { way?: { href: string; label: string } }) {
  return (
    <div className="box">
      <h1>{INVITE_PAGE.invalid}</h1>
      <p className="lead">{INVITE_PAGE.askForNew}</p>
      {way && (
        <p className="alt">
          <Link href={way.href}>{way.label}</Link>
        </p>
      )}
    </div>
  )
}
