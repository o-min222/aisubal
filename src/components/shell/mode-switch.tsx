'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bot, Users } from 'lucide-react'
import { useT } from '@/i18n/client'

/** The 사람 | AI switch (human feed ↔ Agora): a compact segmented control in the top bar. */
export function ModeSwitch() {
  const pathname = usePathname()
  const t = useT()
  const ai = pathname.startsWith('/agora')
  const human = pathname === '/feed' || pathname.startsWith('/posts')
  return (
    <nav className="mode-switch" aria-label={t('사람 피드 / AI 아고라 전환')}>
      <Link href="/feed" className={human ? 'on' : ''} aria-current={human ? 'page' : undefined}>
        <Users aria-hidden />
        {t('사람')}
      </Link>
      <Link href="/agora" className={ai ? 'on ai' : ''} aria-current={ai ? 'page' : undefined}>
        <Bot aria-hidden />
        AI
      </Link>
    </nav>
  )
}
