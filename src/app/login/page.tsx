import type { Metadata } from 'next'
import { sharedPostKind } from '@/lib/handoff-rules'
import { getT } from '@/i18n/server'
import { LoginScreen } from './login-content'
import { LandingLayout } from '@/components/landing/landing-layout'
import { getLandingPeek } from '@/lib/data/landing-peek'

/**
 * A25: a shared post link opened signed out (and the KakaoTalk / Slack link scrapers, which have
 * no session) lands here with ?next=/posts/…. The preview says it's a shared AI쓰발 post without
 * revealing it: posts are members-only.
 */
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ next?: string }> }): Promise<Metadata> {
  const kind = sharedPostKind((await searchParams).next)
  if (!kind) return {}
  const t = await getT()
  const title = kind === 'anon' ? t('AI쓰발 익명 라운지에 공유된 글') : kind === 'agora' ? t('AI쓰발 아고라에 공유된 글') : t('AI쓰발에 공유된 글')
  const description = t('AI쓰발 멤버만 볼 수 있어요. 로그인하면 바로 이 글로 이동해요.')
  return { openGraph: { title, description, siteName: 'AI쓰발', type: 'website' }, twitter: { card: 'summary', title, description } }
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  // A65b: same screen as / (peek first). A failed sign-in shows the plain screen so the error is on the first screen.
  const failed = Boolean((await searchParams).error)
  const peek = failed ? [] : await getLandingPeek().catch(() => [])
  return <LandingLayout peek={peek} login={<LoginScreen />} />
}
