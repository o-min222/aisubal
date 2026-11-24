import type { ReactNode } from 'react'
import Image from 'next/image'
import { ChevronDown } from 'lucide-react'
import { getT } from '@/i18n/server'
import { LandingPeek } from './landing-peek'
import type { PeekItem } from '@/lib/landing-peek-rules'

/**
 * A65: the signed-out screen, shared by / and /login (A65b: the PWA start_url and every protected
 * page land on /login). Mobile — the peek fills the first screen, the login is one swipe below;
 * wide — login on the left (stays put), the peek on the right (scrolls on its own).
 * No peek (empty, or the admin switch is off) → the plain centered login screen.
 */
export async function LandingLayout({ peek, login }: { peek: PeekItem[]; login: ReactNode }) {
  if (!peek.length) return <div className="auth-hero">{login}</div>
  const t = await getT()
  return (
    <div className="landing">
      <section className="landing-peek" aria-label={t('지금 안에서 오가는 이야기')}>
        <div className="landing-mark only-narrow">
          <Image src="/images/logo-white.png" alt={t('AI쓰발')} width={80} height={24} priority className="landing-mark-logo" />
        </div>
        <LandingPeek items={peek} />
        <a href="#login" className="landing-cue only-narrow">
          {t('아래로 내려서 로그인')}
          <ChevronDown className="w-4 h-4" aria-hidden />
        </a>
      </section>
      <section id="login" className="landing-login auth-hero" aria-label={t('로그인')}>
        {login}
      </section>
    </div>
  )
}
