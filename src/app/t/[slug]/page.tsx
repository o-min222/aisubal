import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Heart, Lock, MessageCircle } from 'lucide-react'
import { getTeaser } from '@/lib/data/teasers'
import { LOCALE_META, isLocale } from '@/i18n/config'
import { DICTS } from '@/i18n/dict'
import { makeT } from '@/i18n/translate'
import { getLocale, getT } from '@/i18n/server'

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string }> }

/** placeholder lines under the blur: fixed filler, never the real text */
const FILLER = [
  '이 아래는 초대받은 회원만 볼 수 있는 내용이에요. 회원들은 자기 AI 워크플로를',
  '솔직하게 나누고, 서로 써본 도구와 설정을 묻고 답해요. 지금 보이는 건 첫 몇 줄뿐이에요.',
  '초대장이 있으면 전체 글과 답글, 반응을 모두 볼 수 있어요.',
]

/** OG for Kakao / X / Slack: title + first line only (same server-side excerpt) */
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params
  const { lang } = await searchParams
  const locale = isLocale(lang) ? lang : await getLocale()
  const t = makeT(locale, DICTS[locale])
  const teaser = await getTeaser(slug).catch(() => null)
  if (!teaser) return { title: t('AI쓰발'), robots: { index: false, follow: false } }
  const title = teaser.title || teaser.excerpt.split('\n')[0].slice(0, 60)
  const description = t('{name}님의 글 · 초대장이 있어야 볼 수 있어요', { name: teaser.author.name })
  const image = { url: `/t/${slug}/og?lang=${locale}`, width: 1200, height: 630, alt: title }
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, siteName: 'AI쓰발', type: 'article', locale: LOCALE_META[locale].og, images: [image] },
    twitter: { card: 'summary_large_image', title, description, images: [image.url] },
  }
}

/** A56: the blur teaser. Title, first lines and counts; the rest is blurred filler. */
export default async function TeaserPage({ params, searchParams }: Props & { searchParams: Promise<{ lang?: string; preview?: string }> }) {
  const { slug } = await params
  const found = await getTeaser(slug).catch(() => null)
  if (!found) notFound()
  // dev only: see the outsider view while DEV_BYPASS_AUTH signs everyone in
  const guest = process.env.NODE_ENV !== 'production' && (await searchParams).preview === 'guest'
  const teaser = guest ? { ...found, post: null } : found
  const t = await getT()
  const when = new Date(teaser.created_at).toLocaleDateString((await getLocale()) === 'en' ? 'en-US' : 'ko-KR', { month: 'short', day: 'numeric' })

  return (
    <div className="teaser-page">
      <Link href="/" className="teaser-logo" aria-label={t('AI쓰발')}>
        <Image src="/images/logo-black.png" alt={t('AI쓰발')} width={120} height={36} priority className="logo-ink h-8 w-auto" />
      </Link>
      <main className="teaser-card">
        <header className="teaser-author">
          {teaser.author.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={teaser.author.avatar} alt="" className="teaser-avatar" />
          ) : (
            <span className="teaser-avatar teaser-avatar-ph" aria-hidden>{[...teaser.author.name][0]}</span>
          )}
          <span className="teaser-name">{teaser.author.name}</span>
          <span className="teaser-dot" aria-hidden>·</span>
          <span className="teaser-when">{when}</span>
        </header>
        {teaser.title && <h1 className="teaser-title">{teaser.title}</h1>}
        <p className="teaser-excerpt">{teaser.excerpt}</p>
        {teaser.more && (
          <div className="teaser-blur" aria-hidden>
            {FILLER.map((l) => <p key={l}>{l}</p>)}
          </div>
        )}
        <div className="teaser-counts">
          <span><Heart className="w-4 h-4" /> {teaser.likes}</span>
          <span><MessageCircle className="w-4 h-4" /> {teaser.replies}</span>
        </div>
        {teaser.post ? (
          <Link href={`/posts/${teaser.post}`} className="btn btn-primary teaser-cta-btn">{t('전체 글 보기')}</Link>
        ) : (
          <div className="teaser-cta">
            <p className="teaser-cta-line"><Lock className="w-4 h-4" /> {t('초대장이 있어야 볼 수 있어요')}</p>
            <Link href="/join" className="btn btn-primary teaser-cta-btn">{t('대기 명단에 이름 올리기')}</Link>
            <Link href={`/login?next=${encodeURIComponent(`/t/${slug}`)}`} className="text-link teaser-cta-sub">{t('초대장이 있거나 이미 회원이에요')}</Link>
          </div>
        )}
      </main>
    </div>
  )
}
