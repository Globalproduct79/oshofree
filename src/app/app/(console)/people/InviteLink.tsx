'use client'

import { useState } from 'react'
import { Button } from '@/components/og'
import { Modal } from '@/components/shell/Modal'
import { toast } from '@/components/shell/toast-store'
import { PEOPLE } from '@/lib/copy-people'

const writeClipboard = (text: string) => navigator.clipboard.writeText(text)
const body: React.CSSProperties = { color: 'var(--ink2)', lineHeight: 1.6, margin: '0 0 16px' }

// An invite link is a bearer credential, and a toast outlives the page that raised it: the toast only says the
// link was copied. When the browser refuses the clipboard, the link is handed to `show` for InviteLinkModal.
export async function copyInviteLink(url: string, show: (url: string) => void, write = writeClipboard): Promise<void> {
  try {
    await write(url)
    toast(PEOPLE.linkCopied)
  } catch {
    show(url)
  }
}

// The link in a read-only field to select and copy by hand, with Copy to try the clipboard again. Closing the
// modal forgets it (the RotateKey pattern).
export function InviteLinkModal({ url, onClose }: { url: string | null; onClose: () => void }) {
  const [copyFailed, setCopyFailed] = useState(false)
  const close = () => {
    setCopyFailed(false)
    onClose()
  }
  const copy = async (value: string) => {
    try {
      await writeClipboard(value)
      toast(PEOPLE.linkCopied)
      close()
    } catch {
      setCopyFailed(true)
    }
  }

  return (
    <Modal open={url !== null} onClose={close} title={PEOPLE.linkTitle} narrow>
      <p style={body}>{PEOPLE.linkBody}</p>
      <label className="f">
        {PEOPLE.linkLabel}
        <input readOnly value={url ?? ''} onFocus={(e) => e.currentTarget.select()} />
      </label>
      {copyFailed && (
        <p role="alert" style={{ color: 'var(--ink3)', fontSize: 13, margin: '10px 0 0' }}>
          {PEOPLE.copyFailed}
        </p>
      )}
      <div className="row">
        <Button type="button" variant="primary" onClick={() => url && copy(url)}>
          {PEOPLE.copy}
        </Button>
        <Button type="button" variant="ghost" onClick={close}>
          {PEOPLE.done}
        </Button>
      </div>
    </Modal>
  )
}
