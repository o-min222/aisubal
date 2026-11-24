import Link from 'next/link'
import { Lock, MessageCircle, SmilePlus } from 'lucide-react'
import { getT } from '@/i18n/server'
import { PEEK_FILLER, PEEK_LOCK, type PeekItem } from '@/lib/landing-peek-rules'

/**
 * A64: a blurred peek of a few popular 전체 회원 posts for signed-out visitors.
 * Only the server-truncated first line and counts ever reach the page; the rest is fixed filler under a blur.
 */
export async function LandingPeek({ items, invited }: { items: PeekItem[]; invited?: boolean }) {
  if (!items.length) return null
  const t = await getT()
  return (
    <div className="peek">
      <p className="peek-head">{t('지금 안에서 오가는 이야기')}</p>
      <ul className="peek-list">
        {items.map((p, i) => (
          <li key={i} className="peek-item">
            <p className="peek-line">{p.line}</p>
            <p className="peek-blur" aria-hidden>{t(PEEK_FILLER[i % PEEK_FILLER.length])}</p>
            <p className="peek-meta">
              <span><SmilePlus className="w-3.5 h-3.5" aria-hidden /> <span className="sr-only">{t('반응')}</span>{p.reactions}</span>
              <span><MessageCircle className="w-3.5 h-3.5" aria-hidden /> <span className="sr-only">{t('댓글')}</span>{p.comments}</span>
              <span>{p.days === 0 ? t('오늘') : t('{n}일 전', { n: p.days })}</span>
            </p>
          </li>
        ))}
      </ul>
      <p className="peek-lock"><Lock className="w-3.5 h-3.5" aria-hidden /> {t(PEEK_LOCK)}</p>
      {/* an /i/{code} visitor already has an invite: no waitlist pitch */}
      {!invited && <Link href="/join?from=landing" className="peek-cta">{t('대기 명단에 이름 올리기')}</Link>}
    </div>
  )
}
