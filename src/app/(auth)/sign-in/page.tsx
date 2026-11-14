'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { COPY } from '@/lib/copy'
import { signInAction } from './actions'

function SignInForm() {
  const params = useSearchParams()
  const callbackUrl = params.get('callbackUrl') ?? ''
  const invite = params.get('invite') ?? ''
  const [error, action, pending] = useActionState(signInAction, null)
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <input type="hidden" name="invite" value={invite} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">{COPY.auth.emailLabel}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">{COPY.auth.passwordLabel}</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending}>{COPY.auth.signInAction}</Button>
      <Link href={invite ? `/sign-up?invite=${invite}` : '/sign-up'} className="text-sm text-muted-foreground underline">{COPY.auth.toSignUp}</Link>
    </form>
  )
}

export default function SignInPage() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{COPY.auth.signInTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <Suspense>
          <SignInForm />
        </Suspense>
      </CardContent>
    </Card>
  )
}
