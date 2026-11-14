import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { INVITE_PAGE } from '@/lib/copy-people'

// A link that can no longer be accepted (accepted, revoked, expired, or retired by Resend), with nothing to act
// on. The invite page shows it, and so do sign-up and sign-in when such a link opened them.
export function InvalidInvite() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{INVITE_PAGE.invalid}</CardTitle>
      </CardHeader>
    </Card>
  )
}
