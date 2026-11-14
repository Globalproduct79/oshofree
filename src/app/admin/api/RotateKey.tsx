'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/og'
import { Modal } from '@/components/shell/Modal'
import { toast } from '@/components/shell/toast-store'
import { API_COPY } from '@/lib/copy-api'
import { rotateKeyAction } from './actions'

const K = API_COPY.keys
const body: React.CSSProperties = { color: 'var(--ink2)', lineHeight: 1.6, margin: '0 0 16px' }

// "Rotate key" (the API page's head primary) → a styled confirm → the new key, shown once with Copy. Closing the
// modal forgets it.
export function RotateKey() {
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState<string | null>(null)
  const [copyFailed, setCopyFailed] = useState(false)
  const [pending, start] = useTransition()
  const close = () => {
    setOpen(false)
    setKey(null)
    setCopyFailed(false)
  }
  const rotate = () =>
    start(async () => {
      const res = await rotateKeyAction()
      if ('error' in res) {
        toast(res.error)
        return close()
      }
      setKey(res.key)
      toast(K.rotated)
    })
  // The key never goes into a toast: a toast outlives the modal, and the key must not.
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopyFailed(false)
      toast(K.copied)
    } catch {
      setCopyFailed(true)
    }
  }

  return (
    <>
      <Button type="button" variant="primary" onClick={() => setOpen(true)}>
        {K.rotate}
      </Button>
      <Modal open={open} onClose={close} title={key ? K.newTitle : K.confirmTitle} narrow>
        {key ? (
          <>
            <p style={body}>{K.newBody}</p>
            <p style={{ margin: 0 }}>
              <span className="tok" style={{ wordBreak: 'break-all' }}>
                {key}
              </span>
            </p>
            {copyFailed && (
              <p role="alert" style={{ color: 'var(--ink3)', fontSize: 13, margin: '10px 0 0' }}>
                {K.copyFailed}
              </p>
            )}
            <div className="row">
              <Button type="button" variant="primary" onClick={() => copy(key)}>
                {K.copy}
              </Button>
              <Button type="button" variant="ghost" onClick={close}>
                {K.done}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p style={body}>{K.confirmBody}</p>
            <div className="row">
              <Button type="button" variant="primary" disabled={pending} onClick={rotate}>
                {K.rotate}
              </Button>
              <Button type="button" variant="ghost" disabled={pending} onClick={close}>
                {K.cancel}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  )
}
