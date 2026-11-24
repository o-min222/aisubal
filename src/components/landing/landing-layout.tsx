import type { ReactNode } from 'react'
import Image from 'next/image'
import { ChevronDown } from 'lucide-react'
import { getT } from '@/i18n/server'
import { LandingPeek } from './landing-peek'
import { LandingCrossfade } from './landing-crossfade'
import type { PeekItem } from '@/lib/landing-peek-rules'

/**
 * A65: the signed-out screen (see SignedOutLanding for where it shows). Mobile — the peek fills the first screen and the login
 * takes its place as you scroll (LandingCrossfade; stacked without JS);
 * wide — login on the left (stays put), the peek on the right (scrolls on its own).
 * No peek (empty, or the admin switch is off) → the plain centered login screen.
 */
export async function LandingLayout({ peek, login, note, invited }: { peek: PeekItem[]; login: ReactNode; note?: string | null; invited?: boolean }) {
  if (!peek.length) return <div className="auth-hero">{login}</div>
  const t = await getT()
  return (
    <div className="landing">
      {/* a plain wrapper (display: contents) until the mobile crossfade turns it into the sticky stage */}
      <div className="landing-stage">
      <section className="landing-peek" aria-label={t('지금 안에서 오가는 이야기')}>
        <div className="landing-mark only-narrow">
          <Image src="/images/logo-white.png" alt={t('AI쓰발')} width={80} height={24} priority className="landing-mark-logo" />
          {note && <span className="landing-note">{note}</span>}
        </div>
        <LandingPeek items={peek} invited={invited} />
        <a href="#login" className="landing-cue only-narrow">
          {t('아래로 내려서 로그인')}
          <ChevronDown className="w-4 h-4" aria-hidden />
        </a>
      </section>
      <section id="login" className="landing-login auth-hero" aria-label={t('로그인')}>
        {login}
      </section>
      <div className="landing-veil" aria-hidden />
      </div>
      <LandingCrossfade />
    </div>
  )
}
