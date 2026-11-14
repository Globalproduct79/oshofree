'use client'

import { useState } from 'react'
import { Button } from '@/components/og'
import { toast } from '@/components/shell/toast-store'
import { PEOPLE } from '@/lib/copy-people'

const writeClipboard = (text: string) => navigator.clipboard.writeText(text)

// An invite link is a bearer credential, and a toast outlives the page that raised it: the toast only says the
// link was copied. False when the browser refuses the clipboard; nothing is toasted then.
export async function copyInviteLink(url: string, write = writeClipboard): Promise<boolean> {
  try {
    await write(url)
    toast(PEOPLE.linkCopied)
    return true
  } catch {
    return false
  }
}

// The link a Send or a Resend just made, shown only to whoever clicked: a read-only field to select, and Copy.
// When the clipboard refuses, a line says to copy it by hand.
export function InviteLinkField({ url }: { url: string }) {
  const [copyFailed, setCopyFailed] = useState(false)
  return (
    <div className="stack">
      <label className="f">
        {PEOPLE.linkLabel}
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
      </label>
      {copyFailed && (
        <p role="alert" className="sub">
          {PEOPLE.linkBody}
        </p>
      )}
      <div className="btns">
        <Button type="button" variant="primary" size="s" onClick={async () => setCopyFailed(!(await copyInviteLink(url)))}>
          {PEOPLE.copy}
        </Button>
      </div>
    </div>
  )
}
