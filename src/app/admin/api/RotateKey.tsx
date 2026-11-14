'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/og'
import { Modal } from '@/components/shell/Modal'
import { toast } from '@/components/shell/toast-store'
import { API_COPY } from '@/lib/copy-api'
import { rotateKeyAction } from './actions'

const K = API_COPY.keys
const body: React.CSSProperties = { color: 'var(--ink2)', lineHeight: 1.6, margin: '0 0 16px' }

// "Rotate key" → a styled confirm → the new key, shown once with Copy. Closing the modal forgets it.
export function RotateKey() {
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const close = () => {
    setOpen(false)
    setKey(null)
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
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast(K.copied)
    } catch {
      toast(value)
    }
  }

  return (
    <>
      <Button type="button" variant="ghost" size="s" onClick={() => setOpen(true)}>
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
