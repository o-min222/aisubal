'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { piiWarning } from '@/lib/pii'
import { tn, useT } from '@/i18n/client'
import { uploadPickedImage, type PickedImage } from '@/lib/post-image-client'

/**
 * A149: the state every composer shares — text (with an optional character cap), busy, the
 * two-press PII guard and the submit flow (guards → PII → send → error toast). Each surface keeps
 * its own layout, payload and after-post behavior in `send`; throwing there shows the message.
 * No surface keeps drafts today, so the core has none either.
 */
export function useComposer({
  initialBody = '',
  maxLength,
  piiNotice,
  guard,
  send,
  errorFallback,
}: {
  initialBody?: string
  /** char limit: longer input is cut, like a maxLength field */
  maxLength?: number
  /** turns the PII guard on: the toast shown on the first press (a second press posts anyway) */
  piiNotice?: (pii: string) => string
  /** extra precondition after the empty/busy check (e.g. 익명 topic); return false to stop */
  guard?: () => boolean
  send: (body: string) => Promise<void>
  errorFallback: () => string
}) {
  const [body, setRaw] = useState(initialBody)
  const [busy, setBusy] = useState(false)
  const [piiAckFor, setPiiAckFor] = useState<string | null>(null)
  const guarded = Boolean(piiNotice)
  const pii = useMemo(() => (guarded ? piiWarning(body) : null), [body, guarded])
  const setBody = useCallback((v: string) => setRaw(maxLength ? v.slice(0, maxLength) : v), [maxLength])

  async function submit() {
    if (!body.trim() || busy) return
    if (guard && !guard()) return
    if (pii && piiNotice && piiAckFor !== body) {
      setPiiAckFor(body)
      toast.warning(piiNotice(pii))
      return
    }
    setBusy(true)
    try {
      await send(body)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : errorFallback())
    } finally {
      setBusy(false)
    }
  }

  return { body, setBody, busy, pii, piiAcked: Boolean(pii) && piiAckFor === body, submit }
}

const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif'

/** One attached image: upload on pick, the hidden file input, and the state a preview needs. */
export function useImageAttach(initial: PickedImage | null = null, onPicked?: (image: PickedImage) => void) {
  const tr = useT()
  const [image, setImage] = useState<PickedImage | null>(initial)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function pick(f: File | undefined) {
    if (!f) return
    setUploading(true)
    try {
      const picked = await uploadPickedImage(f, (s) => tr(s))
      setImage(picked)
      onPicked?.(picked)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tn('업로드하지 못했어요.'))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const input = <input ref={fileRef} type="file" accept={IMAGE_ACCEPT} hidden onChange={(e) => void pick(e.target.files?.[0])} />
  return { image, setImage, uploading, open: () => fileRef.current?.click(), input }
}
