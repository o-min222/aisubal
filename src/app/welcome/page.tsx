import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { getPledgeStatus } from '@/lib/data/pledge'
import { getMyPrompt } from '@/lib/data/onboarding'
import { WelcomeMission } from './welcome-mission'
import { getLocale, getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('첫 질문 · AI쓰발') }
}

/**
 * A54: the last step of joining — one question; the answer is the member's first post (전체 회원)
 * and opens the feed. ?preview=1 (DEV only) shows it to an account that already did it.
 */
export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const m = state.member
  if (!m.profile_completed_at) redirect('/onboarding')
  const pledge = await getPledgeStatus(m).catch(() => null)
  if (pledge && !pledge.signedAt) redirect('/pledge')
  const preview = (await searchParams).preview === '1' && process.env.DEV_BYPASS_AUTH === 'true'
  if (m.first_mission_at !== null && !preview) redirect('/feed')
  const [prompt, locale, t] = await Promise.all([getMyPrompt(m.id).catch(() => null), getLocale(), getT()])
  const question = prompt ? (locale === 'en' && prompt.en) || prompt.ko : t('AI쓰발 사람들에게 나를 한 줄로 소개해 주세요.')

  return (
    <main className="welcome-page min-h-dvh px-5 pt-10 pb-16 sm:pt-20">
      <div className="mx-auto w-full max-w-[560px]">
        <WelcomeMission name={m.display_name} question={question} preview={preview} />
      </div>
    </main>
  )
}
