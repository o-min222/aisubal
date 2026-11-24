'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { UserAvatar } from '@/components/user-avatar'
import { inviteQrSvg, inviteQrUrl } from '@/lib/invite-qr'
import { T } from '@/i18n/t'
import { tx, useLocale } from '@/i18n/client'

/** Full-screen, always-light view for showing a phone to someone in person. */
export function InviteQrOverlay({
  code,
  origin,
  inviterId,
  inviterName,
  inviterAvatarUrl,
  remaining,
  onClose,
}: {
  code: string
  origin: string
  inviterId: string
  inviterName: string
  inviterAvatarUrl?: string | null
  remaining: number
  onClose: () => void
}) {
  const locale = useLocale()
  const url = inviteQrUrl(code, origin, locale)
  const [svg, setSvg] = useState<string | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()

  useEffect(() => {
    let alive = true
    void inviteQrSvg(url).then((s) => { if (alive) setSvg(s) })
    return () => { alive = false }
  }, [url])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.body.setAttribute('data-scroll-locked', '')
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.body.removeAttribute('data-scroll-locked')
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const ui = (
    <div className="invite-qr-overlay" role="dialog" aria-modal="true" aria-labelledby={titleId} data-invite-qr>
      <button ref={closeRef} type="button" className="invite-qr-close" onClick={onClose} aria-label={tx('닫기')}>
        <X className="w-5 h-5" />
      </button>
      <div className="invite-qr-card">
        <div className="invite-qr-who">
          <UserAvatar id={inviterId} name={inviterName} avatarUrl={inviterAvatarUrl} size="lg" />
          <div>
            <p id={titleId} className="invite-qr-name">{inviterName}</p>
            <p className="invite-qr-line"><T>AI쓰발에 초대해요</T></p>
          </div>
        </div>
        <div className="invite-qr-frame" data-invite-url={url} role="img" aria-label={tx('초대 QR')}>
          {svg ? <span dangerouslySetInnerHTML={{ __html: svg }} /> : <span className="invite-qr-wait" />}
        </div>
        <p className="invite-qr-code">{code}</p>
        <p className="invite-qr-hint"><T>카메라로 이 화면을 찍으면 가입이 시작돼요.</T></p>
        <p className="invite-qr-meta">
          <T>이 코드는 한 번만 쓸 수 있어요</T>
          {' · '}
          <T s="남은 초대장 {n}장" vars={{ n: remaining }} />
        </p>
      </div>
    </div>
  )
  return createPortal(ui, document.body)
}