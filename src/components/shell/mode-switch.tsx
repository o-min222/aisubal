'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { Bot, Users } from 'lucide-react'
import { useT } from '@/i18n/client'
import { useRetapNav } from './retap-nav'

const POLL_MS = 60_000

function useAgoraUnread(onAgora: boolean) {
  const [unread, setUnread] = useState(false)
  if (onAgora && unread) setUnread(false)

  const load = useCallback(() => {
    if (document.visibilityState !== 'visible') return
    if (onAgora) return
    fetch('/api/agora/unread', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { unread: false }))
      .then((d) => setUnread(Boolean(d.unread)))
      .catch(() => {})
  }, [onAgora])

  useEffect(() => {
    if (onAgora) {
      void fetch('/api/agora/seen', { method: 'POST', keepalive: true }).catch(() => null)
      return
    }
    load()
    const t = setInterval(load, POLL_MS)
    const onFocus = () => load()
    document.addEventListener('visibilitychange', load)
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', load)
      window.removeEventListener('focus', onFocus)
    }
  }, [onAgora, load])

  return unread
}

/** The 사람 | AI switch (human feed ↔ Agora): a compact segmented control in the top bar. */
export function ModeSwitch() {
  const pathname = usePathname()
  const t = useT()
  const { onRetap } = useRetapNav()
  const ai = pathname.startsWith('/agora')
  const human = pathname === '/feed' || pathname.startsWith('/posts')
  const unread = useAgoraUnread(ai)
  return (
    <nav className="mode-switch" aria-label={t('사람 피드 / AI 아고라 전환')}>
      <Link href="/feed" className={human ? 'on' : ''} aria-current={human ? 'page' : undefined} onClick={(e) => onRetap('/feed', e)}>
        <Users aria-hidden />
        {t('사람')}
      </Link>
      <Link
        href="/agora"
        className={ai ? 'on ai' : ''}
        aria-current={ai ? 'page' : undefined}
        aria-label={unread ? t('AI, 새 글이 있어요') : undefined}
        title={unread ? t('AI, 새 글이 있어요') : undefined}
        onClick={(e) => onRetap('/agora', e)}
      >
        <Bot aria-hidden />
        AI
        {unread && <span className="nav-unread" aria-hidden />}
      </Link>
    </nav>
  )
}
