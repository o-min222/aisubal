import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { CheckCircle2, AlertCircle } from 'lucide-react'
import { getUserState } from '@/lib/auth'
import { getInvitePreview } from '@/lib/data/invites'
import { INVITE_STATUS_TEXT, SITE_INTRO, normalizeInviteCode } from '@/lib/invite-share'
import { InviteLandingActions } from '@/components/invite/invite-landing-actions'
import { LocaleSwitch } from '@/components/i18n/locale-switch'
import { LOCALE_META, isLocale } from '@/i18n/config'
import { DICTS } from '@/i18n/dict'
import { makeT } from '@/i18n/translate'
import { getLocale, getT } from '@/i18n/server'

type Props = { params: Promise<{ code: string }>; searchParams: Promise<{ lang?: string }> }

/** Link previews: crawlers send no cookie, so ?lang= (added to share links by
 * non-Korean inviters) picks the card's language; otherwise the request locale. */
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { code } = await params
  const { lang } = await searchParams
  const locale = isLocale(lang) ? lang : await getLocale()
  const t = makeT(locale, DICTS[locale])
  const preview = await getInvitePreview(code)
  const who = preview.inviter?.displayName
  const intro = t(SITE_INTRO)
  const title = preview.status === 'valid' && who ? t('{name}님이 AI쓰발에 초대했어요', { name: who }) : t('AI쓰발 초대장')
  const image = { url: `/i/${encodeURIComponent(code)}/og?lang=${locale}`, width: 1200, height: 630, alt: t('AI쓰발 초대장') }
  return {
    title,
    description: intro,
    robots: { index: false, follow: false },
    openGraph: { title, description: intro, siteName: 'AI쓰발', type: 'website', locale: LOCALE_META[locale].og, images: [image] },
    twitter: { card: 'summary_large_image', title, description: intro, images: [image.url] },
  }
}

/** Public invite landing: who invited you, whether the code still works, Google login. */
export default async function InviteLandingPage({ params }: Props) {
  const st = await getT()
  const { code: raw } = await params
  const code = normalizeInviteCode(raw)
  const [preview, state] = await Promise.all([getInvitePreview(raw), getUserState().catch(() => ({ type: 'unauthenticated' as const }))])
  const inviter = preview.inviter
  const usable = preview.status === 'valid'
  const isMember = state.type === 'member'
  const t = await getT()

  return (
    <div className="min-h-screen bg-n-f7f7f7 flex flex-col items-center justify-center p-6">
      <Link href="/" className="mb-8" aria-label={st('AI쓰발')}>
        <Image src="/images/logo-black.png" alt={st('AI쓰발')} width={160} height={48} priority className="logo-ink h-10 w-auto" />
      </Link>
      <main className="invite-landing w-full max-w-md bg-n-fff border border-n-e5e5e5 rounded-2xl p-7 text-center">
        {inviter ? (
          inviter.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={inviter.avatarUrl} alt="" className="w-16 h-16 rounded-full mx-auto object-cover ring-4 ring-n-f3f3f3" />
          ) : (
            <span className="w-16 h-16 rounded-full mx-auto bg-n-111 text-n-fff text-2xl font-bold inline-flex items-center justify-center ring-4 ring-n-f3f3f3" aria-hidden>
              {[...inviter.displayName][0]}
            </span>
          )
        ) : (
          <span className="w-16 h-16 rounded-full mx-auto bg-n-eee inline-flex items-center justify-center text-2xl" aria-hidden>
            ✉️
          </span>
        )}
        <h1 className="mt-4 text-xl font-bold" style={{ color: 'var(--n-111)' }}>
          {inviter && preview.status !== 'invalid' ? t('{name}님이 AI쓰발에 초대했어요', { name: inviter.displayName }) : t('AI쓰발 초대장')}
        </h1>
        <p className="mt-2 text-sm text-n-555 leading-relaxed">{t(SITE_INTRO)}</p>

        <div
          className={`mt-5 rounded-xl px-3 py-2.5 text-sm flex items-start gap-2 text-left ${usable ? 'bg-c-eefbf3 text-c-17663a' : 'bg-c-fff4e5 text-c-8a4b00'}`}
          role="status"
        >
          {usable ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
          <span>
            {code && <b className="font-mono tracking-wider mr-1.5">{code}</b>}
            {t(INVITE_STATUS_TEXT[preview.status])}
          </span>
        </div>

        <div className="mt-6">
          {isMember ? (
            <div className="space-y-3">
              <p className="text-sm text-n-555">{t('이미 AI쓰발 멤버예요. 이 초대 링크는 새로 오는 분을 위한 거예요.')}</p>
              <Link href="/feed" className="btn btn-primary w-full justify-center min-h-[48px]">
                {t('피드로 가기')}
              </Link>
            </div>
          ) : (
            <InviteLandingActions code={code} usable={usable} signedIn={state.type === 'waitlist'} />
          )}
        </div>
      </main>
      <p className="mt-6 text-xs text-n-999 text-center max-w-sm">
        {t('초대받은 분만 가입할 수 있어요. 로그인에는 Google 계정만 쓰고, 이메일·실명은 다른 멤버에게 보이지 않아요.')}
      </p>
      <div className="mt-4">
        <LocaleSwitch />
      </div>
    </div>
  )
}
