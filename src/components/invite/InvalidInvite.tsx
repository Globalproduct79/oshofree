import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { INVITE_PAGE } from '@/lib/copy-people'

// A link that can no longer be accepted (accepted, revoked, expired, or retired by Resend): it says so and to ask
// for a new one. The invite page shows it; sign-in and sign-up, when such a link opened them, add their own way on
// without the invite (`way`).
export function InvalidInvite({ way }: { way?: { href: string; label: string } }) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{INVITE_PAGE.invalid}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{INVITE_PAGE.askForNew}</p>
        {way && (
          <Link href={way.href} className="text-sm underline">
            {way.label}
          </Link>
        )}
      </CardContent>
    </Card>
  )
}
