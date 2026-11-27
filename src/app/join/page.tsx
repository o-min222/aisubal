import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { waitlistCount } from '@/lib/data/public-waitlist'
import { joinSource } from '@/lib/join-rules'
import { SITE_INTRO, SITE_ORIGIN } from '@/lib/invite-share'
import { getT } from '@/i18n/server'
import { JoinForm } from './join-form'
import { OG_DEFAULT } from '@/lib/og'

type Props = { searchParams: Promise<{ from?: string; preview?: string }> }

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  const title = t('AI쓰발 대기 명단')
  const description = t(SITE_INTRO)
  return { title, description, openGraph: { title, description, url: `${SITE_ORIGIN}/join`, siteName: 'AI쓰발', type: 'website', images: [OG_DEFAULT] }, twitter: { card: 'summary_large_image', title, description, images: [OG_DEFAULT.url] } }
}

/** A57: public waitlist. Email + an optional line about why; admins invite from /admin/waitlist. */
export default async function JoinPage({ searchParams }: Props) {
  const { from, preview } = await searchParams
  const state = await getUserState().catch(() => ({ type: 'unauthenticated' as const }))
  // dev only: DEV_BYPASS_AUTH signs everyone in, so ?preview=1 shows the outsider page
  const devPreview = process.env.NODE_ENV !== 'production' && preview === '1'
  if (state.type === 'member' && !devPreview) redirect('/feed')
  const t = await getT()
  const waiting = await waitlistCount().catch(() => null)
  return (
    <div className="teaser-page">
      <Link href="/" className="teaser-logo" aria-label={t('AI쓰발')}>
        <Image src="/images/logo-black.png" alt={t('AI쓰발')} width={120} height={36} priority className="logo-ink h-8 w-auto" />
      </Link>
      <main className="teaser-card join-card">
        <h1 className="join-title">{t('초대장을 기다리는 중이에요')}</h1>
        <p className="join-sub">{t(SITE_INTRO)} {t('자리가 나면 운영진이 초대 코드를 보내 드려요.')}</p>
        <JoinForm initialWaiting={waiting} source={joinSource(from)} />
        <Link href="/#login" className="text-link join-login">{t('초대장이 있거나 이미 회원이에요')}</Link>
      </main>
    </div>
  )
}
