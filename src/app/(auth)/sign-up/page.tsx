'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { COPY } from '@/lib/copy'
import { signUpAction } from './actions'

function SignUpCard() {
  const invite = useSearchParams().get('invite') ?? ''
  const [error, action, pending] = useActionState(signUpAction, null)
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{COPY.auth.signUpTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="invite" value={invite} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">{COPY.auth.nameLabel}</Label>
            <Input id="name" name="name" autoComplete="name" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">{COPY.auth.emailLabel}</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">{COPY.auth.passwordLabel}</Label>
            <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending}>{COPY.auth.signUpAction}</Button>
          <Link href={invite ? `/sign-in?invite=${invite}` : '/sign-in'} className="text-sm text-muted-foreground underline">{COPY.auth.toSignIn}</Link>
        </form>
      </CardContent>
    </Card>
  )
}

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpCard />
    </Suspense>
  )
}
