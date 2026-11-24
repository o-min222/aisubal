import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { getInvitePreview } from '@/lib/data/invites'
import { SITE_INTRO, normalizeInviteCode } from '@/lib/invite-share'
import { SignedOutLanding } from '@/components/landing/signed-out-landing'
import { LOCALE_META, isLocale } from '@/i18n/config'
import { DICTS } from '@/i18n/dict'
import { makeT } from '@/i18n/translate'
import { getLocale } from '@/i18n/server'

type Props = { params: Promise<{ code: string }>; searchParams: Promise<{ lang?: string; preview?: string }> }

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
  const title = preview.status === 'valid' && who ? t('{name}님이 당신을 AI쓰발에 지목했습니다', { name: who }) : t('AI쓰발 초대장')
  const image = { url: `/i/${encodeURIComponent(code)}/og?lang=${locale}`, width: 1200, height: 630, alt: title }
  return {
    title,
    description: intro,
    robots: { index: false, follow: false },
    openGraph: { title, description: intro, siteName: 'AI쓰발', type: 'website', locale: LOCALE_META[locale].og, images: [image] },
    twitter: { card: 'summary_large_image', title, description: intro, images: [image.url] },
  }
}

/**
 * A65c: an invite link opens the same signed-out screen as /, with who invited them and the code's
 * status in the login column (the middleware already saved the code for after Google sign-in).
 * It keeps its own URL so link previews keep the personal card above.
 */
export default async function InviteLandingPage({ params, searchParams }: Props) {
  const { code: raw } = await params
  // dev only: DEV_BYPASS_AUTH signs everyone in, so ?preview=1 shows the signed-out screen
  const devPreview = process.env.NODE_ENV !== 'production' && (await searchParams).preview === '1'
  const [preview, state] = await Promise.all([getInvitePreview(raw), getUserState().catch(() => ({ type: 'unauthenticated' as const }))])
  if (state.type === 'member' && !devPreview) redirect('/feed')
  // signed in, not a member yet: the signup screen fills in the saved code
  if (state.type === 'waitlist') redirect('/waitlist')
  return <SignedOutLanding invite={{ code: normalizeInviteCode(raw), preview }} />
}
