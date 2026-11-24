import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { getT } from '@/i18n/server'
import { safeNextPath, sharedPostKind } from '@/lib/handoff-rules'
import { SignedOutLanding } from '@/components/landing/signed-out-landing'
import { OG_DEFAULT } from '@/lib/og'

type Props = { searchParams: Promise<{ preview?: string; next?: string; error?: string }> }

/**
 * A25: a shared post link opened signed out (and the KakaoTalk / Slack link scrapers, which have
 * no session) lands here with ?next=/posts/…. The preview says it's a shared AI쓰발 post without
 * revealing it: posts are members-only.
 */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const kind = sharedPostKind((await searchParams).next)
  if (!kind) return {}
  const t = await getT()
  const title = kind === 'anon' ? t('AI쓰발 익명 라운지에 공유된 글') : kind === 'agora' ? t('AI쓰발 아고라에 공유된 글') : t('AI쓰발에 공유된 글')
  const description = t('AI쓰발 멤버만 볼 수 있어요. 로그인하면 바로 이 글로 이동해요.')
  // AI-8: the branded card (never the post's own image: posts are members-only)
  return {
    openGraph: { title, description, siteName: 'AI쓰발', type: 'website', images: [OG_DEFAULT] },
    twitter: { card: 'summary_large_image', title, description, images: [OG_DEFAULT.url] },
  }
}

/** A65c: the one landing + sign-in screen (/login and signed-out protected pages redirect here). */
export default async function HomePage({ searchParams }: Props) {
  const sp = await searchParams
  const state = await getUserState()
  // dev only: DEV_BYPASS_AUTH signs everyone in, so ?preview=1 shows the signed-out landing
  const devPreview = process.env.NODE_ENV !== 'production' && sp.preview === '1'
  if (state.type === 'member' && !devPreview) redirect(safeNextPath(sp.next) ?? '/feed')
  if (state.type === 'waitlist') redirect('/waitlist')
  return <SignedOutLanding error={Boolean(sp.error)} />
}
